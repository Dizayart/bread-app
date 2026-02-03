// --- 0. ДИАГНОСТИКА (Это создаст полоску сверху) ---
const tg = window.Telegram?.WebApp;
const debugPanel = document.createElement('div');

// Делаем красную полоску на весь верх экрана
debugPanel.style.cssText = `
  position: fixed; top: 0; left: 0; width: 100%; 
  background: red; color: white; z-index: 10000; 
  font-size: 14px; padding: 10px; text-align: center; font-weight: bold;
`;
document.body.appendChild(debugPanel);

function log(msg) {
  debugPanel.innerText = msg;
}

if (tg) {
  tg.ready();
  tg.expand();
  // Если API работает, полоска станет ЗЕЛЕНОЙ
  debugPanel.style.background = "#228B22"; 
  log(`TG v${tg.version} | ${tg.platform} | Жми экран!`);
} else {
  log("TG API НЕ НАЙДЕН. (Открыто в браузере?)");
}

// --- ТЕСТ-МОЛОТОК: Вибрация при клике в любое место ---
document.addEventListener('click', () => {
  if (!tg) return;
  
  // Пытаемся вызвать вибрацию и пишем результат в полоску
  try {
    tg.HapticFeedback.impactOccurred('heavy'); 
    tg.HapticFeedback.notificationOccurred('success');
    log(`ВИБРАЦИЯ ОТПРАВЛЕНА! v${tg.version}`);
  } catch (e) {
    log(`ОШИБКА: ${e.message}`);
  }
});

// --- ДАЛЕЕ ВАШ ОСНОВНОЙ КОД (БЕЗ ИЗМЕНЕНИЙ) ---

// 1. НАСТРОЙКИ SUPABASE
const SUPABASE_URL = 'https://mnrvemqaukyjerznlaaw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_VMkkVQ1xIClm6MPfue4WiQ_xnOe9FYh';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let baseIngredients = []; 
let glossaryData = [];

// Звук
const timerSound = new Audio('https://mnrvemqaukyjerznlaaw.supabase.co/storage/v1/object/public/asets/mixkit-bell-tick-tock-timer-1046.wav');
timerSound.preload = 'auto';

// 2. ЛОГИКА СЛОВАРЯ
async function fetchGlossary() {
  const { data } = await supabaseClient.from('glossary').select('term, definition');
  glossaryData = data || [];
}

function highlightTerms(text) {
  if (!text) return '';
  let highlightedText = text.replace(/\n/g, '<br>'); 
  const accentRegex = /(\d+[-–/]?\d*\s?(°C|°С|гр\.|минуты|минут|часов|часа|час))/g;
  highlightedText = highlightedText.replace(accentRegex, '<span class="accent-text">$1</span>');

  glossaryData.forEach(item => {
    const regex = new RegExp(`(${item.term})`, 'gi');
    highlightedText = highlightedText.replace(regex, (match) => {
      return `<span class="term-link" onclick="window.showTerm('${match}', '${item.definition.replace(/'/g, "\\'")}')">${match}</span>`;
    });
  });
  return highlightedText;
}

window.showTerm = function(term, definition) {
  // Вибрация при открытии попапа
  if(tg) tg.HapticFeedback.selectionChanged();
  
  document.getElementById('pop-term').innerText = term.charAt(0).toUpperCase() + term.slice(1);
  document.getElementById('pop-def').innerText = definition;
  document.getElementById('glossary-popup').classList.add('active');
};

window.closePopup = function() {
  document.getElementById('glossary-popup').classList.remove('active');
};

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('close-btn')) {
    e.preventDefault();
    window.closePopup();
  }
});

// 3. ТАЙМЕР
window.startTimer = function(element, totalSeconds) {
  if (element.classList.contains('running')) return;
  
  // Вибрация при старте
  if(tg) tg.HapticFeedback.impactOccurred('medium');
  
  timerSound.play().then(() => {
    timerSound.pause();
    timerSound.currentTime = 0;
  }).catch(e => console.log("Audio check"));

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
      element.classList.remove('running');
      textDisplay.innerText = "Готово!";
      timerSound.play();
      // Вибрация в конце
      if(tg) tg.HapticFeedback.notificationOccurred('success');
    }
  }, 1000);
};

function updateTimerVisuals(timeLeft, totalSeconds, fullDash, circle, text) {
   const progress = 1 - (timeLeft / totalSeconds);
   circle.style.strokeDashoffset = fullDash - (progress * fullDash);
   circle.style.strokeWidth = `${2 + (progress * 6)}px`;
   text.innerText = formatTime(timeLeft);
}

function formatTime(seconds) {
  if (seconds < 0) return "0 мин";
  if (seconds <= 3600) return `${Math.floor(seconds / 60)} мин`;
  return `${parseFloat((seconds / 3600).toFixed(1))} ч`;
}

// 4. СБОРКА ИСТОРИИ
async function buildStory() {
  await fetchGlossary();
  const { data: recipe } = await supabaseClient.from('recipes').select('id').eq('slug', 'wheat-bread').single();
  if (!recipe) return;
  await loadIngredients(recipe.id);
  const { data: stages } = await supabaseClient.from('recipe_stages').select('*').eq('recipe_id', recipe.id).order('order_index', { ascending: true });

  const textLayer = document.getElementById('text-layer');
  textLayer.innerHTML = ''; 

  stages.forEach((stage) => {
    const section = document.createElement('section');
    section.className = 'step-block';
    
    section.innerHTML = `
      <h2>${highlightTerms(stage.title)}</h2>
      <div class="hand-divider"></div>
      <p>${highlightTerms(stage.content)}</p>
      ${stage.timer_sec ? `<div class="timer-wrapper" onclick="window.startTimer(this, ${stage.timer_sec})"><svg class="timer-svg" viewBox="0 0 100 100"><circle class="timer-path-bg" cx="50" cy="50" r="45"></circle><circle class="timer-path-progress" cx="50" cy="50" r="45"></circle></svg><div class="timer-text">${formatTime(stage.timer_sec)}</div></div>` : ''}
    `;
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
           // Вибрация при скролле
           if (!entry.target.classList.contains('visible') && tg) {
             tg.HapticFeedback.selectionChanged();
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
  
  setTimeout(() => { document.querySelector('.step-block')?.classList.add('visible'); }, 300);
}

// 5. КАЛЬКУЛЯТОР
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
  document.getElementById('yield-val').innerText = count;
  document.getElementById('ingredients-list').innerHTML = baseIngredients.map(ing => `<li><span>${ing.name}</span><strong>${Math.round(ing.oneUnitWeight * count)} г</strong></li>`).join('');
}

function updateVisuals(state) {
  const bowl = document.getElementById('bowl-state');
  const states = {'intro':'🌾','ingredients_screen':'⚖️','starter_info':'🧪','mix_1':'🥣','autolyse':'⏳','mix_2':'💪','fermentation':'📈','shaping':'⚪','proofing':'🧺','baking':'🔥'};
  const next = states[state] || '🍞';
  if(bowl.innerText !== next) {
    bowl.style.opacity = '0';
    setTimeout(() => { bowl.innerText = next; bowl.style.opacity = '1'; }, 600);
  }
}

// Слушатель слайдера
const yieldSlider = document.getElementById('yield-slider');
yieldSlider.addEventListener('input', (e) => {
  renderIngredients(e.target.value);
  // Вибрация при движении ползунка
  if(tg) tg.HapticFeedback.selectionChanged();
});

buildStory();