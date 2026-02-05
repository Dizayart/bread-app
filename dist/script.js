// --- 1. ИНИЦИАЛИЗАЦИЯ TELEGRAM ---
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  try { tg.expand(); } catch(e) {}
  try { tg.enableClosingConfirmation(); } catch(e) {}
  
  try { 
    tg.setHeaderColor('#fffdf5'); 
    tg.setBackgroundColor('#fffdf5');
  } catch(e) {}
}

function triggerHaptic(type = 'medium') {
  if (!tg || !tg.HapticFeedback) return;
  try {
    if (type === 'selection') {
      tg.HapticFeedback.selectionChanged();
    } else if (['light', 'medium', 'heavy'].includes(type)) {
      tg.HapticFeedback.impactOccurred(type);
    }
  } catch (e) {}
}

// --- 2. НАСТРОЙКИ SUPABASE ---
const SUPABASE_URL = 'https://mnrvemqaukyjerznlaaw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VMkkVQ1xIClm6MPfue4WiQ_xnOe9FYh';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let baseIngredients = []; 
let glossaryData = [];
let currentActiveTerm = null; 

// --- 3. ЛОГИКА СЛОВАРЯ ---
async function fetchGlossary() {
  const { data } = await supabaseClient.from('glossary').select('term, definition');
  glossaryData = data || [];
}

function highlightTerms(text) {
  if (!text) return '';
  let highlightedText = text.replace(/\n/g, '<br>'); 
  
  // Авто-выделение чисел
  // ОБНОВЛЕННОЕ ПРАВИЛО:
  // 1. (\d+([.,]\d+)?)      -> Ловит число, даже дробное (3 или 3,5)
  // 2. (...)?               -> Необязательная часть диапазона (например "- 4")
  // 3. (unit)               -> Единицы измерения
  const accentRegex = /(\d+([.,]\d+)?(\s?[-–—]\s?\d+([.,]\d+)?)?\s?(°C|°С|гр\.|минуты|минут|мин\.|часов|часа|час))/gi;
  highlightedText = highlightedText.replace(accentRegex, '<span class="accent-text">$1</span>');

  // Поиск терминов
  glossaryData.forEach(item => {
    const regex = new RegExp(`(${item.term})`, 'gi');
    highlightedText = highlightedText.replace(regex, (match) => {
      return `<span class="term-link" onclick="window.showTerm('${match}', '${item.definition.replace(/'/g, "\\'")}')">${match}</span>`;
    });
  });
  
  return highlightedText;
}

window.showTerm = function(term, definition) {
  const popup = document.getElementById('glossary-popup');
  
  if (popup.classList.contains('active') && currentActiveTerm === term) {
    window.closePopup();
    return;
  }

  triggerHaptic('selection'); 
  const formattedTerm = term.charAt(0).toUpperCase() + term.slice(1);
  document.getElementById('pop-term').innerText = formattedTerm;
  document.getElementById('pop-def').innerText = definition;
  popup.classList.add('active');
  currentActiveTerm = term;
};

window.closePopup = function() {
  const popup = document.getElementById('glossary-popup');
  if (popup && popup.classList.contains('active')) {
    popup.classList.remove('active');
    triggerHaptic('selection');
    currentActiveTerm = null;
  }
};

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('close-btn')) {
    e.preventDefault();
    window.closePopup();
  }
});

// --- 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
function formatTimeText(seconds) {
  if (seconds < 60) return `${seconds} сек`;
  if (seconds <= 3600) return `${Math.floor(seconds / 60)} мин`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (minutes === 0) return `${hours} ч`;
  return `${hours} ч ${minutes} мин`;
}

// --- 5. СБОРКА ИСТОРИИ ---
async function buildStory() {
  await fetchGlossary();
  const { data: recipe } = await supabaseClient.from('recipes').select('id').eq('slug', 'wheat-bread').single();
  if (!recipe) return;

  await loadIngredients(recipe.id);

  const { data: stages } = await supabaseClient
    .from('recipe_stages').select('*').eq('recipe_id', recipe.id).order('order_index', { ascending: true });

  const textLayer = document.getElementById('text-layer');
  textLayer.innerHTML = ''; 

  stages.forEach((stage) => {
    const section = document.createElement('section');
    section.className = 'step-block';
    
    // Если это самый первый экран (обычно там описание над калькулятором)
    // Добавляем класс для рукописного шрифта
    if (stage.animation_state === 'ingredients_screen' || stage.order_index === 0) {
        section.classList.add('handwritten-intro');
    }
    
    // Генерируем рукописную обводку вместо плашки
    let timerBadge = '';
    if (stage.timer_sec) {
        timerBadge = `
        <div class="static-timer-badge">
            Установите таймер: ${formatTimeText(stage.timer_sec)}
        </div>
        `;
    }

    section.innerHTML = `
      <h2>${highlightTerms(stage.title)}</h2>
      <div class="hand-divider"></div>
      <p>${highlightTerms(stage.content)}</p>
      ${timerBadge}
    `;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          window.closePopup(); 
          if (!entry.target.classList.contains('visible')) {
             triggerHaptic('selection');
          }
          entry.target.classList.add('visible');
          updateVisuals(stage.animation_state);
          toggleCalculator(stage.order_index, stage.animation_state);
        } else {
          entry.target.classList.remove('visible');
        }
      });
    }, { threshold: 0.5 });

    observer.observe(section);
    textLayer.appendChild(section);
  });
  
  setTimeout(() => {
     const first = document.querySelector('.step-block');
     if(first) first.classList.add('visible');
  }, 300);
}

// --- 6. КАЛЬКУЛЯТОР И ПРОЧЕЕ ---
function toggleCalculator(stageIndex, animationState) {
  const calc = document.getElementById('calculator-wrap');
  
  if (animationState === 'ingredients_screen') {
    calc.classList.add('active');
    
    // НОВАЯ ЛОГИКА: Только горизонтальное центрирование
    // scale(1) - нормальный размер
    // translateY(0) - стоит на своем месте (bottom: 40px)
    calc.style.transform = "translateX(-50%) translateY(0) scale(1)";
    
    calc.style.opacity = "1";
    calc.style.pointerEvents = "all";
  } else {
    calc.classList.remove('active');
    
    // При скрытии уезжает чуть вниз и уменьшается
    calc.style.transform = "translateX(-50%) translateY(20px) scale(0.95)";
    
    calc.style.opacity = "0";
    calc.style.pointerEvents = "none";
  }
}

async function loadIngredients(recipeId) {
  const { data } = await supabaseClient.from('ingredients').select('name, base_weight_grams').eq('recipe_id', recipeId);
  if (data) {
    baseIngredients = data.map(ing => ({ name: ing.name, oneUnitWeight: ing.base_weight_grams }));
    renderIngredients(document.getElementById('yield-slider').value);
  }
}

function updateVisuals(state) {
  const bowl = document.getElementById('bowl-state');
  
  // ЛОГИКА СКРЫТИЯ ЭМОДЗИ
  if (state === 'ingredients_screen') {
    bowl.style.opacity = '0'; // Полностью прячем эмодзи
    return; // Выходим, чтобы не рисовать новый
  }

  // Обычная логика для остальных экранов
  const states = {
    'intro': '🌾', 'starter_info': '🧪',
    'mix_1': '🥣', 'autolyse': '⏳', 'mix_2': '💪',
    'fermentation': '📈', 'shaping': '⚪', 'proofing': '🧺', 'baking': '🔥'
  };
  
  const nextEmoji = states[state] || '🍞';
  
  // Если эмодзи отличается или был скрыт - показываем
  if(bowl.innerText !== nextEmoji || bowl.style.opacity === '0') {
    bowl.style.opacity = '0';
    setTimeout(() => { 
        bowl.innerText = nextEmoji; 
        bowl.style.opacity = '1'; 
    }, 300);
  }
}

// Чекбоксы в калькуляторе
function renderIngredients(count) {
  const list = document.getElementById('ingredients-list');
  const yieldVal = document.getElementById('yield-val');
  
  if (yieldVal) yieldVal.innerText = count;
  
  if (list) {
    // Генерируем HTML с чекбоксами
    list.innerHTML = baseIngredients.map((ing, index) => `
      <li class="ingredient-item">
        <label class="ing-label">
          <input type="checkbox" class="ing-checkbox" id="ing-${index}">
          <div class="checkmark-box"></div>
          <span class="ing-name">${ing.name}</span>
        </label>
        
        <span class="ing-weight">${Math.round(ing.oneUnitWeight * count)} г</span>
      </li>
    `).join('');
  }
}

const yieldSlider = document.getElementById('yield-slider');
if (yieldSlider) {
  yieldSlider.addEventListener('input', (e) => {
    renderIngredients(e.target.value);
    triggerHaptic('selection');
  });
}

buildStory();