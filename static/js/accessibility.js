// ============== 鏂版墜鏁欑▼绀轰緥鏁版嵁 ==============
/*
window._TUTORIAL_SAMPLE_SUMMARY = '# 绗竴绔?浜哄伐鏅鸿兘姒傝堪\n\n浜哄伐鏅鸿兘鏄绠楁満绉戝鐨勪竴涓垎鏀紝鏃ㄥ湪鍒涘缓鑳藉妯℃嫙浜虹被鏅鸿兘鐨勭郴缁熴€俓n\n## 绗竴鑺?瀹氫箟涓庡彂灞昞n\n浜哄伐鏅鸿兘璇炵敓浜庝簩鍗佷笘绾簲鍗佸勾浠ｏ紝缁忓巻浜嗗涓彂灞曢樁娈点€俓n\n# 绗簩绔?鏈哄櫒瀛︿範鍩虹\n\n鏈哄櫒瀛︿範鏄汉宸ユ櫤鑳界殑鏍稿績鎶€鏈箣涓€銆俓n\n## 绗竴鑺?鐩戠潱瀛︿範\n\n鐩戠潱瀛︿範閫氳繃鏍囪鏁版嵁璁粌妯″瀷锛屽父鐢ㄤ簬鍒嗙被鍜屽洖褰掍换鍔°€?;

window._TUTORIAL_SAMPLE_EXERCISE = '## 绗?棰橈紙鍩虹锛塡n\n### 棰樺共\n\n璇风畝杩颁汉宸ユ櫤鑳界殑瀹氫箟銆俓n\n### 绛旀\n\n浜哄伐鏅鸿兘鏄绠楁満绉戝鐨勪竴涓垎鏀紝鏃ㄥ湪妯℃嫙浜虹被鏅鸿兘銆俓n\n### 瑙ｆ瀽\n\n涓€銆佹牳蹇冪洰鏍囨槸妯℃嫙浜虹被鏅鸿兘琛屼负銆俓n浜屻€佸簲鐢ㄥ凡娓楅€忓埌鏃ュ父鐢熸椿銆?;

// ============== 鏁欑▼鐘舵€佹満 ==============
window._tutorialActive = false;
window._tutorialStep = 0;
window._tutorialSpeaking = false;
window._rate = typeof window.getSpeechDisplayRate === 'function'
  ? window.getSpeechDisplayRate()
  : (typeof window._rate === 'number' ? window._rate : 1.0);

window._tutorialSteps = [
  {
    prompt: '绗竴姝ワ紝鐐瑰嚮"寮€濮嬪鐞?鎸夐挳涓婁紶鏂囦欢銆?,
    expectedKey: 'any',
    action: function() {}
  },
  {
    prompt: '鏂囦欢宸蹭笂浼犮€傜浜屾锛岀瓑寰匒I澶勭悊瀹屾垚銆?,
    expectedKey: 'any',
    action: function() {}
  },
  {
    prompt: '澶勭悊瀹屾垚銆傜涓夋锛屾寜S閿湕璇绘€荤粨銆?,
    expectedKey: 's',
    action: function() {
      window.playSummarySpeech();
    },
    delay: 4000
  },
  {
    prompt: '绗洓姝ワ紝鎸夌┖鏍奸敭鏆傚仠鏈楄銆?,
    expectedKey: ' ',
    action: function() {}
  },
  {
    prompt: '宸叉殏鍋溿€傜浜旀锛屽啀鎸夌┖鏍奸敭缁х画銆?,
    expectedKey: ' ',
    action: function() {}
  },
  {
    prompt: '绗叚姝ワ紝鎸塜閿仠姝㈡湕璇汇€?,
    expectedKey: 'x',
    action: function() {}
  },
  {
    prompt: '宸插仠姝€傜涓冩锛屾寜鍙崇澶撮敭璺冲埌涓嬩竴娈点€?,
    expectedKey: 'arrowright',
    action: function() { window.speakNext(); },
    delay: 3000
  },
  {
    prompt: '绗叓姝ワ紝鎸夊乏绠ご閿繑鍥炰笂涓€娈点€?,
    expectedKey: 'arrowleft',
    action: function() { window.speakPrev(); },
    delay: 3000
  },
  {
    prompt: '绗節姝ワ紝鎸変笂绠ご閿姞蹇閫熴€?,
    expectedKey: 'ctrl+arrowup',
    action: function() { window.increaseRate(); }
  },
  {
    prompt: '绗崄姝ワ紝鎸変笅绠ご閿噺鎱㈣閫熴€?,
    expectedKey: 'ctrl+arrowdown',
    action: function() { window.decreaseRate(); }
  },
  {
    prompt: '鎭枩锛佹柊鎵嬫暀绋嬪叏閮ㄥ畬鎴愩€傛寜H閿彲闅忔椂鏌ョ湅蹇嵎閿府鍔┿€傛寜浠绘剰閿繘鍏ユ甯告ā寮忋€?,
    expectedKey: 'any',
    action: function() {}
  }
];

// ============== 鏁欑▼鎺у埗鍑芥暟 ==============
window._tutorialTimeout = null;

function notifyAIAssistantAvailability() {
  if (typeof window.refreshAIAssistantAvailability === 'function') {
    window.refreshAIAssistantAvailability();
  }
}

function closeAIAssistantIfOpen() {
  if (window._aiWindowOpen && typeof window.closeAIAssistant === 'function') {
    window.closeAIAssistant();
  }
}

window.startTutorial = function() {
  closeAIAssistantIfOpen();
  window._tutorialActive = true;
  window._tutorialStep = 0;
  window._tutorialSpeaking = true;
  notifyAIAssistantAvailability();
  window.speechSynthesis.cancel();
  window.showTutorialPopup();
  var welcome = new SpeechSynthesisUtterance('娆㈣繋浣跨敤鑱嗗厜涓€闂紝鍗冲皢寮€濮嬫柊鎵嬫暀绋嬨€傛寜F閿彲闅忔椂璺宠繃銆?);
  welcome.lang = 'zh-CN';
  welcome.rate = window._rate;
  welcome.onend = function() { window.speakTutorialStep(); };
  window.speechSynthesis.speak(welcome);
};

window._tutorialDescriptions = [
  '瀛︿範濡備綍涓婁紶鏂囨。',
  '绛夊緟AI澶勭悊',
  '浣跨敤璇煶鏈楄鎬荤粨鍐呭',
  '瀛︿範鏆傚仠鏈楄鍔熻兘',
  '瀛︿範缁х画鏈楄鍔熻兘',
  '瀛︿範鍋滄鏈楄鍔熻兘',
  '瀛︿範璺宠浆鍒颁笅涓€娈?,
  '瀛︿範杩斿洖涓婁竴娈?,
  '瀛︿範鍔犲揩璇€?,
  '瀛︿範鍑忔參璇€?,
  '鏁欑▼瀹屾垚'
];

window.showTutorialPopup = function() {
  var popup = document.getElementById('tutorial-popup');
  if(!popup) {
    popup = document.createElement('div');
    popup.id = 'tutorial-popup';
    popup.style.cssText = 'position:fixed;top:20px;right:20px;background:rgba(30,64,175,0.95);color:white;padding:16px 24px;border-radius:12px;z-index:9998;font-size:16px;box-shadow:0 4px 20px rgba(0,0,0,0.3);min-width:220px;max-width:280px;';
    document.body.appendChild(popup);
  }
  var stepNum = window._tutorialStep + 1;
  var totalSteps = window._tutorialSteps.length;
  var step = window._tutorialSteps[window._tutorialStep];
  var desc = window._tutorialDescriptions[window._tutorialStep] || '鏁欑▼杩涜涓?;
  var keyMap = {enter:'鍥炶溅',' ':'绌烘牸',arrowright:'鈫?,arrowleft:'鈫?,arrowup:'鈫?,arrowdown:'鈫?, 'ctrl+arrowup':'Ctrl + 鈫?, 'ctrl+arrowdown':'Ctrl + 鈫?,any:'浠绘剰閿?'};
  var keyHint = step ? '鎸?' + (keyMap[step.expectedKey] || step.expectedKey.toUpperCase()) + ' 閿户缁? : '';
  popup.innerHTML = '<div style="font-weight:bold;margin-bottom:8px;font-size:14px;">馃摎 鏂版墜鏁欑▼</div>' +
    '<div style="font-size:28px;font-weight:bold;margin-bottom:6px;">绗?' + stepNum + ' / ' + totalSteps + ' 姝?/div>' +
    '<div style="font-size:15px;margin-bottom:8px;line-height:1.4;">' + desc + '</div>' +
    '<div style="font-size:13px;background:rgba(255,255,255,0.2);padding:6px 10px;border-radius:6px;margin-bottom:8px;">' + keyHint + '</div>' +
    '<div style="font-size:11px;opacity:0.7;">鎸?F 閿烦杩囨暀绋?/div>';
};

window.hideTutorialPopup = function() {
  var popup = document.getElementById('tutorial-popup');
  if(popup) popup.remove();
};

window.speakTutorialStep = function() {
  if(!window._tutorialActive) return;
  if(window._tutorialStep >= window._tutorialSteps.length) {
    window._tutorialActive = false;
    window._tutorialSpeaking = false;
    window.hideTutorialPopup();
    notifyAIAssistantAvailability();
    return;
  }
  if(window._tutorialTimeout) { clearTimeout(window._tutorialTimeout); window._tutorialTimeout = null; }
  window.showTutorialPopup();
  window.speechSynthesis.cancel();
  var step = window._tutorialSteps[window._tutorialStep];
  window._tutorialSpeaking = true;
  var u = new SpeechSynthesisUtterance(step.prompt);
  u.lang = 'zh-CN'; u.rate = window._rate;
  u.onend = function() {
    window._tutorialSpeaking = false;
    window._tutorialTimeout = setTimeout(function() {
      if(window._tutorialActive && !window._tutorialSpeaking) window.speakTutorialStep();
    }, 5000);
  };
  window.speechSynthesis.speak(u);
};

window.advanceTutorial = function() {
  if(!window._tutorialActive) return;
  if(window._tutorialTimeout) { clearTimeout(window._tutorialTimeout); window._tutorialTimeout = null; }
  var step = window._tutorialSteps[window._tutorialStep];
  window.speechSynthesis.cancel();
  window._tutorialSpeaking = false;
  if(step && step.action) step.action();
  window._tutorialStep++;
  if(window._tutorialStep >= window._tutorialSteps.length) {
    window._tutorialActive = false;
    window.hideTutorialPopup();
    notifyAIAssistantAvailability();
    setTimeout(function() {
      var done = new SpeechSynthesisUtterance('鏁欑▼宸插畬鎴愶紒');
      done.lang = 'zh-CN'; done.rate = window._rate;
      window.speechSynthesis.speak(done);
    }, 500);
    return;
  }
  setTimeout(function() { window.speakTutorialStep(); }, step.delay || 1500);
};

window.skipTutorial = function() {
  if(window._tutorialTimeout) { clearTimeout(window._tutorialTimeout); window._tutorialTimeout = null; }
  window._tutorialActive = false;
  window._tutorialStep = 0;
  window._tutorialSpeaking = false;
  window.speechSynthesis.cancel();
  window.hideTutorialPopup();
  notifyAIAssistantAvailability();
  var msg = new SpeechSynthesisUtterance('宸茶烦杩囨暀绋嬨€傛寜H閿煡鐪嬪揩鎹烽敭甯姪銆?);
  msg.lang = 'zh-CN'; msg.rate = window._rate;
  window.speechSynthesis.speak(msg);
};

// ============== AI 绐楀彛鐘舵€?==============
*/
window._tutorialActive = !!window._tutorialActive;
window._tutorialStep = typeof window._tutorialStep === 'number' ? window._tutorialStep : 0;
window._tutorialSpeaking = !!window._tutorialSpeaking;
window._rate = typeof window.getSpeechDisplayRate === 'function'
  ? window.getSpeechDisplayRate()
  : (typeof window._rate === 'number' ? window._rate : 1.0);

function notifyAIAssistantAvailability() {
  if (typeof window.refreshAIAssistantAvailability === 'function') {
    window.refreshAIAssistantAvailability();
  }
}

function closeAIAssistantIfOpen() {
  if (window._aiWindowOpen && typeof window.closeAIAssistant === 'function') {
    window.closeAIAssistant();
  }
}

if (typeof window.startTutorial !== 'function') {
  window.startTutorial = function() {};
}
if (typeof window.skipTutorial !== 'function') {
  window.skipTutorial = function() {
    window._tutorialActive = false;
    window._tutorialSpeaking = false;
    notifyAIAssistantAvailability();
  };
}

window._aiWindowOpen = false;
window._spacebarDownTime = 0;
window._spacebarTimer = null;
window._spacebarHandled = false;

// ============== 鍏ㄥ眬 TTS 鐘舵€?==============
window._sumText = typeof window._sumText === 'string' ? window._sumText : '';
window._exText = typeof window._exText === 'string' ? window._exText : '';
window._allSections = Array.isArray(window._allSections) ? window._allSections : [];
window._sectionIdx = typeof window._sectionIdx === 'number' ? window._sectionIdx : 0;
window._currentSource = window._currentSource || 'sum';
window._currentUtteranceText = window._currentUtteranceText || '';
window._currentPosition = typeof window._currentPosition === 'number' ? window._currentPosition : 0;
window._answerText = window._answerText || '';
window._waitingForAnswer = !!window._waitingForAnswer;
window._applyingNewRate = !!window._applyingNewRate;

window.hasSpeechPlaybackSupport = function() {
  return !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
};

window.getSpeechSourceText = function(source) {
  return source === 'ex' ? (window._exText || '') : (window._sumText || '');
};

// 鎸夋爣棰樺垎鍓叉钀?
window.splitSections = function(text) {
  var sections = [], lines = text.split('\n'), current = [];
  for(var i = 0; i < lines.length; i++) {
    if(lines[i].match(/^#{1,3}\s+/)) {
      if(current.length > 0) sections.push(current.join('\n'));
      current = [lines[i]];
    } else { current.push(lines[i]); }
  }
  if(current.length > 0) sections.push(current.join('\n'));
  return sections.filter(function(s){ return s.trim().length > 0; });
};

// 娓呯悊markdown鏍煎紡
window.cleanMarkdown = function(text) {
  return text.replace(/^#+\s*/gm,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'$1');
};

window.findSectionIndex = function(sections, title) {
  for(var i = 0; i < sections.length; i++) {
    if(sections[i].indexOf(title) >= 0) return i;
  }
  return 0;
};

window.stopCurrentSpeech = function() {
  if(!window.speechSynthesis) return false;
  window._applyingNewRate = false;
  window._waitingForAnswer = false;
  window._answerText = '';
  window._currentPosition = 0;
  window._currentUtteranceText = '';
  window._allSections = [];
  window._sectionIdx = 0;
  window.speechSynthesis.cancel();
  return true;
};

window.startSpeechPlayback = function(source) {
  if(!window.hasSpeechPlaybackSupport()) return false;
  var nextSource = source === 'ex' ? 'ex' : 'sum';
  var sourceText = window.getSpeechSourceText(nextSource);
  if(!sourceText || !sourceText.trim()) return false;

  var sections = window.splitSections(sourceText);
  if(!sections.length) return false;

  window._allSections = sections;
  window._sectionIdx = 0;
  window._currentSource = nextSource;
  window._waitingForAnswer = false;
  window._answerText = '';
  window.speakFromIndex();
  return true;
};

window.playSummarySpeech = function() {
  return window.startSpeechPlayback('sum');
};

window.toggleCurrentSpeechPause = function() {
  if(!window.speechSynthesis) return false;
  if(window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
    return true;
  }
  if(window.speechSynthesis.speaking) {
    window.speechSynthesis.pause();
    return true;
  }
  return false;
};

window.onAssistantShortSpacePress = function() {
  if(window._waitingForAnswer) {
    window.speakAnswer();
    return true;
  }
  return window.toggleCurrentSpeechPause();
};

// 渚嬮鏈楄锛堥骞?绛旀鍒嗘锛?
window.speakExerciseWithPause = function(text) {
  var answerKeywords = ['答案', '解答', '参考答案', '解析：', '解析'];
  var questionPart = text, answerPart = '';
  for(var i = 0; i < answerKeywords.length; i++) {
    var idx = text.indexOf(answerKeywords[i]);
    if(idx > 0) {
      var lineStart = text.lastIndexOf('\n', idx);
      if(lineStart < 0) lineStart = 0;
      questionPart = text.substring(0, lineStart);
      answerPart = text.substring(lineStart);
      break;
    }
  }
  questionPart = window.cleanMarkdown(questionPart);
  answerPart = window.cleanMarkdown(answerPart);
  window._answerText = answerPart;
  window._waitingForAnswer = false;
  window.speechSynthesis.cancel();
  window._currentUtteranceText = questionPart;
  window._currentPosition = 0;
  var u = new SpeechSynthesisUtterance(questionPart);
  u.lang = 'zh-CN'; u.rate = window._rate;
  u.onboundary = function(e) { if(e.name==='word') window._currentPosition = e.charIndex; };
  u.onend = function() {
    if(answerPart && answerPart.trim()) {
      window._waitingForAnswer = true;
      var hint = new SpeechSynthesisUtterance('棰樺共鏈楄瀹屾瘯锛屾寜绌烘牸閿惉绛旀');
      hint.lang = 'zh-CN'; hint.rate = window._rate;
      window.speechSynthesis.speak(hint);
    }
    window._currentPosition = 0; window._currentUtteranceText = '';
  };
  window.speechSynthesis.speak(u);
};

window.speakAnswer = function() {
  if(window._waitingForAnswer && window._answerText) {
    window._waitingForAnswer = false;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(window._answerText);
    u.lang = 'zh-CN'; u.rate = window._rate;
    u.onboundary = function(e) { if(e.name==='word') window._currentPosition = e.charIndex; };
    u.onend = function() { window._currentPosition = 0; window._currentUtteranceText = ''; };
    window.speechSynthesis.speak(u);
    window._answerText = '';
  }
};

window.speakFromIndex = function() {
  if(!window._allSections || window._allSections.length === 0) return;
  var clean = window.cleanMarkdown(window._allSections[window._sectionIdx]);
  window._applyingNewRate = true;
  window.speechSynthesis.cancel();
  window._currentUtteranceText = clean;
  window._currentPosition = 0;
  var u = new SpeechSynthesisUtterance(clean);
  u.lang = 'zh-CN'; u.rate = window._rate;
  u.onboundary = function(e) { if(e.name==='word') window._currentPosition = e.charIndex; };
  u.onend = function() {
    if(!window._applyingNewRate) {
      window._currentPosition = 0; window._currentUtteranceText = '';
      window.autoAdvanceSection();
    }
  };
  setTimeout(function() { window._applyingNewRate = false; window.speechSynthesis.speak(u); }, 50);
};

window.autoAdvanceSection = function() {
  if(window._allSections && window._sectionIdx < window._allSections.length - 1) {
    window._sectionIdx++;
    window.speakFromIndex();
  }
};

window.speakPrev = function() {
  if(!window._allSections || !window._allSections.length) return;
  window._sectionIdx = Math.max(0, window._sectionIdx - 1);
  window.speakFromIndex();
};

window.speakNext = function() {
  if(!window._allSections || !window._allSections.length) return;
  window._sectionIdx = Math.min(window._allSections.length - 1, window._sectionIdx + 1);
  window.speakFromIndex();
};

// 璇€熻皟鑺?
window.applyNewRate = function() {
  var wasSpeaking = (window.speechSynthesis.speaking || window.speechSynthesis.paused) && window._currentUtteranceText;
  var remainingText = wasSpeaking ? window._currentUtteranceText.substring(window._currentPosition) : '';
  window._applyingNewRate = true;
  window.speechSynthesis.cancel();
  var tip = new SpeechSynthesisUtterance('当前语速已调整为 ' + window._rate + ' 倍');
  tip.lang = 'zh-CN'; tip.rate = window._rate;
  tip.onend = function() {
    window._applyingNewRate = false;
    if(wasSpeaking && remainingText.trim()) {
      window._currentUtteranceText = remainingText; window._currentPosition = 0;
      var u = new SpeechSynthesisUtterance(remainingText);
      u.lang = 'zh-CN'; u.rate = window._rate;
      u.onboundary = function(e) { if(e.name==='word') window._currentPosition = e.charIndex; };
      u.onend = function() {
        if(!window._applyingNewRate) { window._currentPosition = 0; window._currentUtteranceText = ''; window.autoAdvanceSection(); }
      };
      window.speechSynthesis.speak(u);
    }
  };
  setTimeout(function() { window.speechSynthesis.speak(tip); }, 50);
};

window.increaseRate = function() {
  var step = typeof window.SPEECH_RATE_STEP === 'number' ? window.SPEECH_RATE_STEP : 0.1;
  var maxRate = typeof window.SPEECH_RATE_MAX === 'number' ? window.SPEECH_RATE_MAX : 10;
  if(window._rate < maxRate) { window._rate = Math.round((window._rate + step) * 10) / 10; window.applyNewRate(); }
};
window.decreaseRate = function() {
  var step = typeof window.SPEECH_RATE_STEP === 'number' ? window.SPEECH_RATE_STEP : 0.1;
  var minRate = typeof window.SPEECH_RATE_MIN === 'number' ? window.SPEECH_RATE_MIN : 0.5;
  if(window._rate > minRate) { window._rate = Math.round((window._rate - step) * 10) / 10; window.applyNewRate(); }
};

document.addEventListener('keydown', function(e) {
  var inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
  if(inInput) {
    if(e.key === 'Escape') { e.target.blur(); e.preventDefault(); }
    return;
  }
  var k = e.key.toLowerCase();
  var plainHotkey = !e.altKey && !e.ctrlKey && !e.metaKey;
  var nvdaSafeHotkey = e.altKey && !e.ctrlKey && !e.metaKey;
  var globalHotkey = plainHotkey || nvdaSafeHotkey;

  if(window._tutorialActive && window._tutorialManagedByNewEngine) {
    return;
  }

  // 鏁欑▼妯″紡鎷︽埅
  if(window._tutorialActive) {
    if(k === 'f') { window.skipTutorial(); e.preventDefault(); return; }
    var step = window._tutorialSteps[window._tutorialStep];
    if(step) {
      var expected = step.expectedKey;
      var tutorialKey = (e.ctrlKey && (k === 'arrowup' || k === 'arrowdown')) ? ('ctrl+' + k) : k;
      if(expected === 'any' || tutorialKey === expected || e.key === expected) window.advanceTutorial();
    }
    e.preventDefault(); return;
  }

  // AI绐楀彛鎵撳紑鏃讹紝闄sc澶栨墍鏈夊揩鎹烽敭鎸傝捣
  if(window._aiWindowOpen) {
    if(k === 'escape') {
      if(typeof window.closeAIAssistant === 'function') window.closeAIAssistant();
      e.preventDefault();
      return;
    }
    if(k !== 'h') {
      return;
    }
    closeAIAssistantIfOpen();
  }

  // Normal playback hotkeys
  if(globalHotkey && k === 's') {
    if(!window.playSummarySpeech()) { alert('请先上传文档并完成处理'); }
    e.preventDefault();
  }
  if(globalHotkey && k === 'e') {
    if(!window.startSpeechPlayback('ex')) { alert('请先上传文档并完成处理'); }
    e.preventDefault();
  }
  if(globalHotkey && k === 'x') { window.stopCurrentSpeech(); e.preventDefault(); }
  // F閿笉鍐嶅湪姝ｅ父妯″紡涓嬪惎鍔ㄦ暀绋嬶紝鏁欑▼浠呴€氳繃渚ц竟鏍忔寜閽垨棣栨鐧诲綍瑙﹀彂

  if(globalHotkey && k === 'h') {
    e.preventDefault();
    if (typeof window.showHelp === 'function') {
      window.showHelp();
    }
    return;
  }

  var plusPressed = e.key === '+' || e.code === 'NumpadAdd' || (e.code === 'Equal' && e.shiftKey);
  if(plusPressed && window._myNotesPageActive && typeof window.openCreateFolderModal === 'function') { e.preventDefault(); window.openCreateFolderModal(); return; }

  if(window._myNotesPageActive) {
    return;
  }
  if((plainHotkey && e.key === ' ') || (nvdaSafeHotkey && k === 'p')) {
    if(window.onAssistantShortSpacePress && window.onAssistantShortSpacePress()) {
      e.preventDefault();
    }
  }
  if(globalHotkey && e.key === 'ArrowLeft') {
    if(typeof window.onResultArrowLeft === 'function' && window.onResultArrowLeft()) {
      e.preventDefault();
      return;
    }
    window.speakPrev();
    e.preventDefault();
  }
  if(globalHotkey && e.key === 'ArrowRight') { window.speakNext(); e.preventDefault(); }
});

// ============== 椤甸潰鍒濆鍖?==============
// 鏁欑▼涓嶅啀鑷姩鍚姩锛屼粎鍦ㄩ娆℃敞鍐岀櫥褰曟椂鐢卞悗绔紶閫?show_tutorial 鏍囧織瑙﹀彂锛?
// 鎴栫敤鎴蜂富鍔ㄧ偣鍑讳晶杈规爮"鏂版墜鏁欑▼"鎸夐挳鏃惰皟鐢?window.startTutorial()銆?

// ============== 鐩蹭汉瑙嗚鑱氬厜鐏?==============
(function() {
  if (window.__useStandaloneBlindSpotlight) {
    return;
  }
  var overlay, toggleBtn, toggleIcon;
  var active = false;
  var rafPending = false;
  var cursorX = Math.round((window.innerWidth || 0) / 2);
  var cursorY = Math.round((window.innerHeight || 0) / 2);

  function isEditableTarget(target) {
    return !!(target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function renderSpotlight() {
    if (!overlay || !active) return;
    overlay.style.background =
      'radial-gradient(circle 115px at ' + cursorX + 'px ' + cursorY + 'px, ' +
      'rgba(0,0,0,0) 0%, rgba(0,0,0,0) 54%, rgba(0,0,0,0.72) 72%, rgba(0,0,0,0.98) 100%)';
  }

  function scheduleRender() {
    if (!active || !overlay || rafPending) return;
    rafPending = true;
    requestAnimationFrame(function() {
      rafPending = false;
      renderSpotlight();
    });
  }

  function updatePointer(x, y) {
    cursorX = clamp(Number(x) || 0, 0, window.innerWidth || 0);
    cursorY = clamp(Number(y) || 0, 0, window.innerHeight || 0);
    scheduleRender();
  }

  function setActive(on) {
    active = on;
    try {
      localStorage.setItem('blind-spotlight', on ? '1' : '0');
    } catch (error) {
      // Ignore storage access errors in restricted browsing contexts.
    }
    if (on) {
      overlay.style.display = 'block';
      toggleBtn.classList.add('active');
      toggleBtn.setAttribute('aria-pressed', 'true');
      if (toggleIcon) toggleIcon.className = 'fas fa-eye-slash';
      renderSpotlight();
    } else {
      overlay.style.display = 'none';
      toggleBtn.classList.remove('active');
      toggleBtn.setAttribute('aria-pressed', 'false');
      if (toggleIcon) toggleIcon.className = 'fas fa-eye';
    }
  }

  function toggleSpotlight() {
    if (!overlay || !toggleBtn) return;
    setActive(!active);
  }

  function init() {
    overlay = document.getElementById('blind-spotlight-overlay');
    toggleBtn = document.getElementById('blind-spotlight-toggle');
    if (!overlay || !toggleBtn) return;
    toggleIcon = toggleBtn.querySelector('i');
    window.toggleBlindSpotlight = toggleSpotlight;

    // 鎭㈠涓婃鐨勭姸鎬?
    try {
      if (localStorage.getItem('blind-spotlight') === '1') {
        setActive(true);
      }
    } catch (error) {
      // Ignore storage access errors in restricted browsing contexts.
    }

    toggleBtn.addEventListener('click', function() {
      toggleSpotlight();
    });

    document.addEventListener('keydown', function(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (window._tutorialActive || window._helpOverlayOpen || window._aiWindowOpen) return;
      if (isEditableTarget(e.target)) return;
      if (String(e.key || '').toLowerCase() !== 't') return;
      e.preventDefault();
      e.stopPropagation();
      toggleSpotlight();
    }, true);

    document.addEventListener('mousemove', function(e) {
      if (!active) return;
      updatePointer(e.clientX, e.clientY);
    });

    document.addEventListener('touchmove', function(e) {
      if (!active || !e.touches || !e.touches[0]) return;
      updatePointer(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    window.addEventListener('resize', function() {
      cursorX = clamp(cursorX || Math.round((window.innerWidth || 0) / 2), 0, window.innerWidth || 0);
      cursorY = clamp(cursorY || Math.round((window.innerHeight || 0) / 2), 0, window.innerHeight || 0);
      scheduleRender();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

(function() {
  function hasSpeechSupport() {
    return !!window.speechSynthesis;
  }

  function isEditableTarget(target) {
    return !!(target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ));
  }

  function closeHelpOverlay() {
    var existing = document.getElementById('help-overlay');
    if (existing) {
      existing.remove();
    }
    window._helpOverlayOpen = false;
    if (hasSpeechSupport()) {
      window.speechSynthesis.cancel();
    }
    if (typeof notifyAIAssistantAvailability === 'function') {
      notifyAIAssistantAvailability();
    }
  }

  function getUniversalHelpLines() {
    return [
      'Alt + H - 打开或关闭使用帮助',
      'Alt + 1 - 前往上传文档',
      'Alt + 2 - 前往我的笔记',
      'Alt + 3 - 前往错题本',
      'Alt + 4 - 前往学习社区',
      'Esc - 关闭使用帮助'
    ];
  }

  function buildHelpContent() {
    var isUploadPage = !!document.getElementById('uploadForm');
    var isMyNotesPage = !!window._myNotesPageActive;
    var isMistakePage = !!document.getElementById('mistake-document-view');
    var isCommunityPage = !!document.getElementById('community-search-input');
    var isResultPage = !!document.getElementById('btn-download-summary');
    var universalLines = getUniversalHelpLines();
    var pageName = '当前页面';
    var pageLines = [];

    if (isUploadPage) {
      pageName = '上传文档';
      pageLines = [
        'Alt + J - 选择并上传文档',
        'Enter - 开始处理',
        'Alt + R - 重置上传表单',
        '长按 Alt + V - 语音输入处理需求，松开发送'
      ];
    } else if (isMyNotesPage) {
      pageName = '我的笔记';
      pageLines = [
        'Tab - 在文件夹、笔记和按钮之间切换',
        'Enter - 打开当前笔记或文件夹',
        'F2 - 重命名当前聚焦的文件夹',
        'M - 移动当前聚焦的笔记或文件夹',
        'Delete / Backspace - 删除当前聚焦的笔记或文件夹',
        '+ - 新建文件夹',
        'Ctrl + Space - 打开 AI 助手',
        '长按空格 - 直接语音输入，松开发送'
      ];
    } else if (isMistakePage) {
      pageName = '错题本';
      pageLines = [
        '左右方向键 - 切换文档或题目',
        'Enter - 进入当前文档或开始重做',
        'Backspace - 返回文档列表',
        'R - 重读当前内容'
      ];
    } else if (isCommunityPage) {
      pageName = '学习社区';
      pageLines = [
        '/ - 聚焦搜索框',
        '上 / 下方向键 - 切换帖子',
        'Enter - 展开或收起当前帖子',
        'L - 朗读当前帖子',
        '空格 - 暂停或继续朗读',
        'U - 保存当前帖子到我的笔记',
        'Delete - 删除当前帖子'
      ];
    } else if (isResultPage) {
      pageName = '文档总结';
      pageLines = [
        'Alt + S - 朗读总结',
        'Alt + P - 暂停或继续',
        'Alt + X - 停止朗读',
        'Alt + 左 / 右方向键 - 切换上一段或下一段',
        'Alt + B - 生成总结盲文',
        'Alt + D - 下载总结文档',
        'Alt + E - 前往例题'
      ];
    } else {
      pageLines = [
        '按 F 打开当前页面新手教程',
        '按 H 打开当前页面使用帮助'
      ];
    }

    var overlayLines = [
      '【' + pageName + '使用帮助】',
      ''
    ].concat(pageLines).concat(['', '【通用快捷键】']).concat(universalLines);

    var speechText = '欢迎来到使用帮助，当前页面是' + pageName + '，按 Esc 随时关闭使用帮助。' +
      pageLines.join('。') + '。通用快捷键有：' + universalLines.join('。') + '。';

    return {
      pageName: pageName,
      overlayText: overlayLines.join('\n'),
      speechText: speechText
    };
  }

  function openHelpOverlay() {
    var existing = document.getElementById('help-overlay');
    if (existing) {
      closeHelpOverlay();
      return;
    }
    if (typeof closeAIAssistantIfOpen === 'function') {
      closeAIAssistantIfOpen();
    }
    window._helpOverlayOpen = true;
    if (typeof notifyAIAssistantAvailability === 'function') {
      notifyAIAssistantAvailability();
    }

    var content = buildHelpContent();
    var overlay = document.createElement('div');
    overlay.id = 'help-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.82);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

    var box = document.createElement('div');
    box.style.cssText = 'background:white;padding:24px 32px;border-radius:12px;max-width:560px;width:min(560px,100%);font-size:15px;line-height:1.8;white-space:pre-wrap;box-shadow:0 20px 40px rgba(0,0,0,0.25);';
    box.textContent = content.overlayText;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) {
        closeHelpOverlay();
      }
    });

    if (!hasSpeechSupport()) {
      return;
    }

    if (typeof window.speakWithGlobalConfig === 'function') {
      window.speakWithGlobalConfig(content.speechText, {
        force: true,
        interrupt: true,
        track: false,
        delayMs: 60
      });
      return;
    }

    var msg = new SpeechSynthesisUtterance(content.speechText);
    msg.lang = 'zh-CN';
    msg.rate = typeof window._rate === 'number' ? window._rate : 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(msg);
  }

  window.showHelp = openHelpOverlay;
  window.openKeyboardHelpOverlay = openHelpOverlay;

  document.addEventListener('keydown', function(event) {
    var key = String(event.key || '').toLowerCase();

    if (window._helpOverlayOpen && key === 'escape') {
      event.preventDefault();
      event.stopPropagation();
      closeHelpOverlay();
      return;
    }

    if (!(event.altKey && !event.ctrlKey && !event.metaKey) && (event.altKey || event.ctrlKey || event.metaKey)) {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    if (key !== 'h') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openHelpOverlay();
  }, true);
})();

(function() {
  function clampRate(value) {
    var minRate = typeof window.SPEECH_RATE_MIN === 'number' ? window.SPEECH_RATE_MIN : 0.5;
    var maxRate = typeof window.SPEECH_RATE_MAX === 'number' ? window.SPEECH_RATE_MAX : 10;
    var step = typeof window.SPEECH_RATE_STEP === 'number' ? window.SPEECH_RATE_STEP : 0.1;
    var numeric = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numeric)) numeric = 1;
    numeric = Math.max(minRate, Math.min(maxRate, numeric));
    return Math.round(numeric / step) * step;
  }

  function syncRateUi(rateValue) {
    var panel = document.getElementById('global-rate-panel');
    var panelLabel = document.querySelector('label[for="global-rate-slider"]');
    var slider = document.getElementById('global-rate-slider');
    var label = document.getElementById('global-rate-value');
    var minRate = typeof window.SPEECH_RATE_MIN === 'number' ? window.SPEECH_RATE_MIN : 0.5;
    var maxRate = typeof window.SPEECH_RATE_MAX === 'number' ? window.SPEECH_RATE_MAX : 10;
    var step = typeof window.SPEECH_RATE_STEP === 'number' ? window.SPEECH_RATE_STEP : 0.1;
    if (panel) panel.setAttribute('aria-label', '语速调节');
    if (panelLabel) panelLabel.textContent = '语速';
    if (slider) {
      slider.min = String(minRate);
      slider.max = String(maxRate);
      slider.step = String(step);
      slider.value = String(rateValue);
    }
    if (label) label.textContent = Number(rateValue).toFixed(1) + 'x';
  }

  function persistRate(rateValue) {
    if (typeof window.setSpeechDisplayRate === 'function') {
      window.setSpeechDisplayRate(rateValue, { source: 'accessibility-persist', forceEvent: true });
      return;
    }
    try {
      localStorage.setItem('global-speech-rate', String(rateValue));
    } catch (error) {}
  }

  function restoreRate() {
    if (typeof window.getSpeechDisplayRate === 'function') {
      window._rate = window.getSpeechDisplayRate();
      syncRateUi(window._rate);
      return;
    }
    try {
      var saved = parseFloat(localStorage.getItem('global-speech-rate') || '');
      if (!isNaN(saved)) {
        window._rate = clampRate(saved);
      }
    } catch (error) {}
    if (typeof window._rate !== 'number' || isNaN(window._rate)) {
      window._rate = 1;
    }
    syncRateUi(window._rate);
  }

  window.syncGlobalRateControls = syncRateUi;

  window.applyNewRate = function(nextRate, options) {
    var opts = options || {};
    var targetRate = clampRate(typeof nextRate === 'number' ? nextRate : window._rate);
    var shouldAnnounce = opts.announce === true;

    if (typeof window.setSpeechDisplayRate === 'function') {
      targetRate = window.setSpeechDisplayRate(targetRate, {
        source: opts.source || 'accessibility-rate',
        forceEvent: true
      });
    } else {
      window._rate = targetRate;
      persistRate(window._rate);
    }
    window._rate = targetRate;
    syncRateUi(window._rate);

    var handledByPage = false;
    if (typeof window.onGlobalRateChange === 'function') {
      try {
        handledByPage = window.onGlobalRateChange(window._rate, opts) === true;
      } catch (error) {}
    }

    if (handledByPage || !window.speechSynthesis) {
      return window._rate;
    }

    if (typeof window.hasTrackedSpeech === 'function' && window.hasTrackedSpeech()) {
      if (typeof window.restartTrackedSpeechWithGlobalRate === 'function') {
        window.restartTrackedSpeechWithGlobalRate({
          delayMs: 30
        });
        return window._rate;
      }
    }

    if (!shouldAnnounce) {
      return window._rate;
    }

    if (typeof window.speakWithGlobalConfig === 'function') {
      window.speakWithGlobalConfig('当前语速 ' + window._rate.toFixed(1) + ' 倍', {
        force: true,
        interrupt: true,
        track: false
      });
      return window._rate;
    }

    var tip = new SpeechSynthesisUtterance('当前语速 ' + window._rate.toFixed(1) + ' 倍');
    tip.lang = 'zh-CN';
    tip.rate = window._rate;
    window.speechSynthesis.cancel();
    setTimeout(function() {
      window.speechSynthesis.speak(tip);
    }, 30);
    return window._rate;
  };

  window.increaseRate = function() {
    var step = typeof window.SPEECH_RATE_STEP === 'number' ? window.SPEECH_RATE_STEP : 0.1;
    return window.applyNewRate((window._rate || 1) + step);
  };

  window.decreaseRate = function() {
    var step = typeof window.SPEECH_RATE_STEP === 'number' ? window.SPEECH_RATE_STEP : 0.1;
    return window.applyNewRate((window._rate || 1) - step);
  };

  window._handleSpeechRateHotkey = function(delta, event, details) {
    var targetRate = details && typeof details.currentRate === 'number'
      ? details.currentRate
      : ((window._rate || 1) + delta);
    return window.applyNewRate(targetRate, {
      announce: true,
      source: 'global-hotkey'
    });
  };

  function bindRatePanel() {
    restoreRate();
    if (window._speechRatePanelBoundBySpeechConfig) {
      return;
    }
    if (window.speechSynthesis && !window._speechRateInterceptorBound) {
      try {
        var synth = window.speechSynthesis;
        var originalSpeak = typeof synth.speak === 'function' ? synth.speak.bind(synth) : null;
        if (originalSpeak) {
          synth.speak = function(utterance) {
            if (utterance && typeof window.configureSpeechUtterance === 'function') {
              window.configureSpeechUtterance(utterance);
            } else if (utterance && typeof window._rate === 'number') {
              utterance.rate = clampRate(window._rate);
            }
            return originalSpeak(utterance);
          };
          window._speechRateInterceptorBound = true;
        }
      } catch (error) {}
    }
    var slider = document.getElementById('global-rate-slider');
    if (!slider || slider.dataset.bound === '1') return;
    slider.dataset.bound = '1';
    if (window.SPEECH_RATE_CHANGE_EVENT) {
      window.addEventListener(window.SPEECH_RATE_CHANGE_EVENT, function(event) {
        var detail = event && event.detail ? event.detail : null;
        if (!detail || typeof detail.displayRate !== 'number') {
          return;
        }
        window._rate = detail.displayRate;
        syncRateUi(window._rate);
      });
    }
    slider.addEventListener('input', function() {
      window.applyNewRate(parseFloat(slider.value), { announce: false });
    });
    slider.addEventListener('change', function() {
      window.applyNewRate(parseFloat(slider.value));
    });
  }

  function shouldIgnoreRateHotkey(target) {
    return !!(target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ));
  }

  document.addEventListener('keydown', function(e) {
    if (shouldIgnoreRateHotkey(e.target)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (window._tutorialActive || window._helpOverlayOpen) return;

    var plusPressed = e.key === '+' || e.code === 'NumpadAdd' || (e.code === 'Equal' && e.shiftKey);
    if (plusPressed && window._myNotesPageActive && typeof window.openCreateFolderModal === 'function') {
      e.preventDefault();
      e.stopPropagation();
      window.openCreateFolderModal();
      return;
    }

  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindRatePanel);
  } else {
    bindRatePanel();
  }
})();

(function() {
  function isEditableTarget(target) {
    return !!(target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ));
  }

  function getNavigationUrl(key) {
    var appUrls = window._appUrls || {};
    if (key === '1') return appUrls.index || '';
    if (key === '2') return appUrls.myNotes || '';
    if (key === '3') return appUrls.mistakes || '';
    if (key === '4') return appUrls.community || '';
    return '';
  }

  document.addEventListener('keydown', function(event) {
    var navByCtrl = event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
    var navByAlt = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (!navByCtrl && !navByAlt) {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    if (window._tutorialActive || window._helpOverlayOpen || window._aiWindowOpen) {
      return;
    }

    var key = String(event.key || '');
    if (key !== '1' && key !== '2' && key !== '3' && key !== '4') {
      return;
    }

    var targetUrl = getNavigationUrl(key);
    if (!targetUrl) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    window.location.href = targetUrl;
  }, true);
})();

