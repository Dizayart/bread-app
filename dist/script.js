// --- 1. ИНИЦИАЛИЗАЦИЯ TELEGRAM ---
const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  // Разворачиваем на весь экран
  try { tg.expand(); } catch(e) {}
  
  // Устанавливаем цвета хедера под стиль приложения (бежевый)
  try { 
    tg.setHeaderColor('#fffdf5'); 
    tg.setBackgroundColor('#fffdf5');
  } catch(e) {}
}

// Утилита для вибрации (безопасная)
function triggerHaptic(type = 'medium') {
  // Если API нет, выходим молча
  if (!tg || !tg.HapticFeedback) return;

  try {
    if (type === 'selection') {
      tg.HapticFeedback.selectionChanged();
    } else if (['light', 'medium', 'heavy'].includes(type)) {
      tg.HapticFeedback.impactOccurred(type);
    } else {
      // success, warning, error
      tg.HapticFeedback.notificationOccurred(type);
    }
  } catch (e) {
    // Игнорируем ошибки на старых устройствах
  }
}

// --- 2. НАСТРОЙКИ SUPABASE ---
const SUPABASE_URL = 'https://mnrvemqaukyjerznlaaw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VMkkVQ1xIClm6MPfue4WiQ_xnOe9FYh';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let baseIngredients = []; 
let glossaryData = [];

// Звук
const timerSound = new Audio('https://mnrvemqaukyjerznlaaw.supabase.co/storage/v1/object/public/asets/mixkit-bell-tick-tock-timer-1046.wav');
timerSound.preload = 'auto';

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
      // replace(/'/g, "\\'") экранирует кавычки
      return `<span class="term-link" onclick="window.showTerm('${match}', '${item.definition.replace(/'/g, "\\'")}')">${match}</span>`;
    });
  });
  
  return highlightedText;
}

// --- ДОБАВЬ ЭТУ ПЕРЕМЕННУЮ ВЫШЕ ИЛИ ПЕРЕД ФУНКЦИЕЙ ---
let currentActiveTerm = null; // Запоминаем, какой термин сейчас открыт

// Обновленная функция показа
window.showTerm = function(term, definition) {
  const popup = document.getElementById('glossary-popup');
  
  // ЛОГИКА ТУМБЛЕРА:
  // Если попап активен И мы кликнули по тому же самому термину -> Закрываем
  if (popup.classList.contains('active') && currentActiveTerm === term) {
    window.closePopup();
    return; // Останавливаем выполнение, чтобы не открыть снова
  }

  // Если это новый термин -> Открываем
  triggerHaptic('selection'); 
  
  // Делаем первую букву заглавной
  const formattedTerm = term.charAt(0).toUpperCase() + term.slice(1);
  
  document.getElementById('pop-term').innerText = formattedTerm;
  document.getElementById('pop-def').innerText = definition;
  popup.classList.add('active');
  
  // Запоминаем текущий термин
  currentActiveTerm = term;
};

// Обновленная функция закрытия
window.closePopup = function() {
  const popup = document.getElementById('glossary-popup');
  if (popup.classList.contains('active')) {
    popup.classList.remove('active');
    triggerHaptic('selection'); // Легкая отдача при закрытии (опционально)
    currentActiveTerm = null;   // Сбрасываем память
  }
};

// --- 4. ТАЙМЕР ---
window.startTimer = function(element, totalSeconds) {
  if (element.classList.contains('running')) return;
  
  triggerHaptic('medium'); // Вибрация старта
  
  // Хак для iOS: запускаем звук по клику, чтобы разблокировать
  timerSound.play().then(() => {
    timerSound.pause();
    timerSound.currentTime = 0;
  }).catch(e => {});

  element.classList.add('running');
  
  const progressCircle = element.querySelector('.timer-path-progress');
  const textDisplay = element.querySelector('.timer-text');
  let timeLeft = totalSeconds;
  
  updateTimerVisuals(timeLeft, totalSeconds, 283, progressCircle, textDisplay);

  const timer = setInterval(() => {
    timeLeft--;
    
    updateTimerVisuals(timeLeft, totalSeconds, 283, progressCircle, textDisplay);

    if (timeLeft <= 0) {
      clearInterval(timer);
      finishTimer(element, textDisplay);
    }
  }, 1000);
};

function updateTimerVisuals(timeLeft, totalSeconds, fullDash, circle, text) {
   const progress = 1 - (timeLeft / totalSeconds);
   circle.style.strokeDashoffset = fullDash - (progress * fullDash);
   
   // Дыхание линии
   const newWidth = 2 + (progress * 6);
   circle.style.strokeWidth = `${newWidth}px`;
   
   text.innerText = formatTime(timeLeft);
}

function finishTimer(element, textDisplay) {
  element.classList.remove('running');
  textDisplay.innerText = "Готово!";

  // Звук + Вибрация успеха
  timerSound.play().catch(e => {});
  triggerHaptic('success');
}

function formatTime(seconds) {
  if (seconds < 0) return "0 мин";
  if (seconds <= 3600) return `${Math.floor(seconds / 60)} мин`;
  return `${parseFloat((seconds / 3600).toFixed(1))} ч`;
}

// --- 5. СБОРКА ИСТОРИИ ---
async function buildStory() {
  await fetchGlossary();

  const { data: recipe } = await supabaseClient
    .from('recipes').select('id').eq('slug', 'wheat-bread').single();

  if (!recipe) return;

  await loadIngredients(recipe.id);

  const { data: stages } = await supabaseClient
    .from('recipe_stages').select('*').eq('recipe_id', recipe.id).order('order_index', { ascending: true });

  const textLayer = document.getElementById('text-layer');
  textLayer.innerHTML = ''; 

  stages.forEach((stage) => {
    const section = document.createElement('section');
    section.className = 'step-block';
    
    const titleWithLinks = highlightTerms(stage.title);
    const contentWithLinks = highlightTerms(stage.content);
    
    section.innerHTML = `
      <h2>${titleWithLinks}</h2>
      <div class="hand-divider"></div>
      <p>${contentWithLinks}</p>
      
      ${stage.timer_sec ? `
        <div class="timer-wrapper" onclick="window.startTimer(this, ${stage.timer_sec})">
          <svg class="timer-svg" viewBox="0 0 100 100">
            <circle class="timer-path-bg" cx="50" cy="50" r="45"></circle>
            <circle class="timer-path-progress" cx="50" cy="50" r="45"></circle>
          </svg>
          <div class="timer-text">${formatTime(stage.timer_sec)}</div>
        </div>
      ` : ''}
    `;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          
          // --- ВОТ СЮДА ДОБАВЛЯЕМ ЗАКРЫТИЕ ПОПАПА ---
          window.closePopup(); 
          // ------------------------------------------

          // Легкая вибрация при смене слайда
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

// --- 6. КАЛЬКУЛЯТОР ---
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
      <li>
        <span>${ing.name}</span>
        <strong>${Math.round(ing.oneUnitWeight * count)} г</strong>
      </li>
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

// Слушатель слайдера
const yieldSlider = document.getElementById('yield-slider');
yieldSlider.addEventListener('input', (e) => {
  renderIngredients(e.target.value);
  triggerHaptic('selection'); // Вибрация "трещотка"
});

// Запуск
buildStory();