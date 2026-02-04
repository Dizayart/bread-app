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
  const accentRegex = /(\d+[-–/]?\d*\s?(°C|°С|гр\.|минуты|минут|часов|часа|час))/g;
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
    
    // Генерируем красивую плашку вместо таймера
    let timerBadge = '';
    if (stage.timer_sec) {
        timerBadge = `
        <div class="static-timer-badge">
            <span class="timer-icon">⏰</span> 
            <span>Установите таймер: <strong>${formatTimeText(stage.timer_sec)}</strong></span>
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
    calc.style.transform = "translate(-50%, -50%) rotate(-1deg)";
  } else {
    calc.classList.remove('active');
    calc.style.transform = "translate(-50%, -50%) rotate(0deg) scale(0.9)";
  }
}

async function loadIngredients(recipeId) {
  const { data } = await supabaseClient.from('ingredients').select('name, base_weight_grams').eq('recipe_id', recipeId);
  if (data) {
    baseIngredients = data.map(ing => ({ name: ing.name, oneUnitWeight: ing.base_weight_grams }));
    renderIngredients(document.getElementById('yield-slider').value);
  }
}

function renderIngredients(count) {
  const list = document.getElementById('ingredients-list');
  const yieldVal = document.getElementById('yield-val');
  if (yieldVal) yieldVal.innerText = count;
  if (list) {
    list.innerHTML = baseIngredients.map(ing => `
      <li><span>${ing.name}</span><strong>${Math.round(ing.oneUnitWeight * count)} г</strong></li>
    `).join('');
  }
}

function updateVisuals(state) {
  const bowl = document.getElementById('bowl-state');
  const states = {
    'intro': '🌾', 'ingredients_screen': '⚖️', 'starter_info': '🧪',
    'mix_1': '🥣', 'autolyse': '⏳', 'mix_2': '💪',
    'fermentation': '📈', 'shaping': '⚪', 'proofing': '🧺', 'baking': '🔥'
  };
  const nextEmoji = states[state] || '🍞';
  if(bowl.innerText !== nextEmoji) {
    bowl.style.opacity = '0';
    setTimeout(() => { 
        bowl.innerText = nextEmoji; 
        bowl.style.opacity = '1'; 
    }, 600);
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