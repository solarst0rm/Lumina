// ============== 新手教程示例数据 ==============
window._TUTORIAL_SAMPLE_SUMMARY = '# 第一章 人工智能概述\n\n人工智能是计算机科学的一个分支，旨在创建能够模拟人类智能的系统。\n\n## 第一节 定义与发展\n\n人工智能诞生于二十世纪五十年代，经历了多个发展阶段。\n\n# 第二章 机器学习基础\n\n机器学习是人工智能的核心技术之一。\n\n## 第一节 监督学习\n\n监督学习通过标记数据训练模型，常用于分类和回归任务。';

window._TUTORIAL_SAMPLE_EXERCISE = '## 第1题（基础）\n\n### 题干\n\n请简述人工智能的定义。\n\n### 答案\n\n人工智能是计算机科学的一个分支，旨在模拟人类智能。\n\n### 解析\n\n一、核心目标是模拟人类智能行为。\n二、应用已渗透到日常生活。';

// ============== 教程状态机 ==============
window._tutorialActive = false;
window._tutorialStep = 0;
window._tutorialSpeaking = false;
window._rate = 1.0;

window._tutorialSteps = [
  {
    prompt: '第一步，点击"开始处理"按钮上传文件。',
    expectedKey: 'any',
    action: function() {}
  },
  {
    prompt: '文件已上传。第二步，等待AI处理完成。',
    expectedKey: 'any',
    action: function() {}
  },
  {
    prompt: '处理完成。第三步，按S键朗读总结。',
    expectedKey: 's',
    action: function() {
      if(window._sumText) {
        window._allSections = window.splitSections(window._sumText);
        window._sectionIdx = 0;
        window._currentSource = 'sum';
        window.speakFromIndex();
      }
    },
    delay: 4000
  },
  {
    prompt: '第四步，按空格键暂停朗读。',
    expectedKey: ' ',
    action: function() {}
  },
  {
    prompt: '已暂停。第五步，再按空格键继续。',
    expectedKey: ' ',
    action: function() {}
  },
  {
    prompt: '第六步，按X键停止朗读。',
    expectedKey: 'x',
    action: function() {}
  },
  {
    prompt: '已停止。第七步，按右箭头键跳到下一段。',
    expectedKey: 'arrowright',
    action: function() { window.speakNext(); },
    delay: 3000
  },
  {
    prompt: '第八步，按左箭头键返回上一段。',
    expectedKey: 'arrowleft',
    action: function() { window.speakPrev(); },
    delay: 3000
  },
  {
    prompt: '第九步，按上箭头键加快语速。',
    expectedKey: 'arrowup',
    action: function() { window.increaseRate(); }
  },
  {
    prompt: '第十步，按下箭头键减慢语速。',
    expectedKey: 'arrowdown',
    action: function() { window.decreaseRate(); }
  },
  {
    prompt: '恭喜！新手教程全部完成。按H键可随时查看快捷键帮助。按任意键进入正常模式。',
    expectedKey: 'any',
    action: function() {}
  }
];

// ============== 教程控制函数 ==============
window._tutorialTimeout = null;

function refreshAIAssistantAvailability() {
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
  refreshAIAssistantAvailability();
  window.speechSynthesis.cancel();
  window.showTutorialPopup();
  var welcome = new SpeechSynthesisUtterance('欢迎使用聆光一闪，即将开始新手教程。按F键可随时跳过。');
  welcome.lang = 'zh-CN';
  welcome.rate = window._rate;
  welcome.onend = function() { window.speakTutorialStep(); };
  window.speechSynthesis.speak(welcome);
};

window._tutorialDescriptions = [
  '学习如何上传文档',
  '等待AI处理',
  '使用语音朗读总结内容',
  '学习暂停朗读功能',
  '学习继续朗读功能',
  '学习停止朗读功能',
  '学习跳转到下一段',
  '学习返回上一段',
  '学习加快语速',
  '学习减慢语速',
  '教程完成'
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
  var desc = window._tutorialDescriptions[window._tutorialStep] || '教程进行中';
  var keyMap = {enter:'回车',' ':'空格',arrowright:'→',arrowleft:'←',arrowup:'↑',arrowdown:'↓',any:'任意键'};
  var keyHint = step ? '按 ' + (keyMap[step.expectedKey] || step.expectedKey.toUpperCase()) + ' 键继续' : '';
  popup.innerHTML = '<div style="font-weight:bold;margin-bottom:8px;font-size:14px;">📚 新手教程</div>' +
    '<div style="font-size:28px;font-weight:bold;margin-bottom:6px;">第 ' + stepNum + ' / ' + totalSteps + ' 步</div>' +
    '<div style="font-size:15px;margin-bottom:8px;line-height:1.4;">' + desc + '</div>' +
    '<div style="font-size:13px;background:rgba(255,255,255,0.2);padding:6px 10px;border-radius:6px;margin-bottom:8px;">' + keyHint + '</div>' +
    '<div style="font-size:11px;opacity:0.7;">按 F 键跳过教程</div>';
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
    refreshAIAssistantAvailability();
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
    refreshAIAssistantAvailability();
    setTimeout(function() {
      var done = new SpeechSynthesisUtterance('教程已完成！');
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
  refreshAIAssistantAvailability();
  var msg = new SpeechSynthesisUtterance('已跳过教程。按H键查看快捷键帮助。');
  msg.lang = 'zh-CN'; msg.rate = window._rate;
  window.speechSynthesis.speak(msg);
};

// ============== AI 窗口状态 ==============
window._aiWindowOpen = false;
window._spacebarDownTime = 0;
window._spacebarTimer = null;
window._spacebarHandled = false;

// ============== 全局 TTS 状态 ==============
window._sumText = typeof window._sumText === 'string' ? window._sumText : '';
window._exText = typeof window._exText === 'string' ? window._exText : '';
window._allSections = [];
window._sectionIdx = 0;
window._currentSource = 'sum';
window._currentUtteranceText = '';
window._currentPosition = 0;
window._answerText = '';
window._waitingForAnswer = false;
window._applyingNewRate = false;

// 按标题分割段落
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

// 清理markdown格式
window.cleanMarkdown = function(text) {
  return text.replace(/^#+\s*/gm,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'$1');
};

window.findSectionIndex = function(sections, title) {
  for(var i = 0; i < sections.length; i++) {
    if(sections[i].indexOf(title) >= 0) return i;
  }
  return 0;
};

// 例题朗读（题干+答案分段）
window.speakExerciseWithPause = function(text) {
  var answerKeywords = ['答案', '解答', '参考答案', '解：', '解:'];
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
      var hint = new SpeechSynthesisUtterance('题干朗读完毕，按空格键听答案');
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

// 语速调节
window.applyNewRate = function() {
  var wasSpeaking = (window.speechSynthesis.speaking || window.speechSynthesis.paused) && window._currentUtteranceText;
  var remainingText = wasSpeaking ? window._currentUtteranceText.substring(window._currentPosition) : '';
  window._applyingNewRate = true;
  window.speechSynthesis.cancel();
  var tip = new SpeechSynthesisUtterance('语速已调整为' + window._rate + '倍');
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
  if(window._rate < 2.0) { window._rate = Math.round((window._rate + 0.1) * 10) / 10; window.applyNewRate(); }
};
window.decreaseRate = function() {
  if(window._rate > 0.5) { window._rate = Math.round((window._rate - 0.1) * 10) / 10; window.applyNewRate(); }
};

// ============== 快捷键 ==============
document.addEventListener('keydown', function(e) {
  if(window._quizVoiceMode && (e.key === ' ' || (e.key === ' ' && e.ctrlKey))) {
    return;
  }
  var inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
  if(inInput) {
    if(e.key === 'Escape') { e.target.blur(); e.preventDefault(); }
    return;
  }
  var k = e.key.toLowerCase();

  // 教程模式拦截
  if(window._tutorialActive) {
    if(k === 'f') { window.skipTutorial(); e.preventDefault(); return; }
    var step = window._tutorialSteps[window._tutorialStep];
    if(step) {
      var expected = step.expectedKey;
      if(expected === 'any' || k === expected || e.key === expected) window.advanceTutorial();
    }
    e.preventDefault(); return;
  }

  // AI窗口打开时，除Esc外所有快捷键挂起
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

  // 正常模式
  if(k === 's') {
    if(window._sumText) {
      window._allSections = window.splitSections(window._sumText);
      window._sectionIdx = 0; window._currentSource = 'sum';
      window.speakFromIndex();
    } else { alert('请先上传文档并处理'); }
    e.preventDefault();
  }
  if(k === 'e') {
    if(window._exText) {
      window._allSections = window.splitSections(window._exText);
      window._sectionIdx = 0; window._currentSource = 'ex';
      window.speakFromIndex();
    } else { alert('请先上传文档并处理'); }
    e.preventDefault();
  }
  if(k === 'x') { window.speechSynthesis.cancel(); window._currentPosition = 0; window._currentUtteranceText = ''; e.preventDefault(); }
  // F键不再在正常模式下启动教程，教程仅通过侧边栏按钮或首次登录触发

  if(k === 'h') {
    e.preventDefault();
    var existingHelp = document.getElementById('help-overlay');
    if(existingHelp) {
      existingHelp.remove();
      window._helpOverlayOpen = false;
      window.speechSynthesis.cancel();
      refreshAIAssistantAvailability();
      return;
    }
    closeAIAssistantIfOpen();
    window._helpOverlayOpen = true;
    refreshAIAssistantAvailability();
    var overlay = document.createElement('div');
    overlay.id = 'help-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;';
    var box = document.createElement('div');
    box.style.cssText = 'background:white;padding:24px 32px;border-radius:12px;max-width:500px;font-size:15px;line-height:1.8;white-space:pre-wrap;';
    box.textContent = '【朗读控制】\nS - 朗读总结  E - 朗读例题\n空格 - 暂停/继续  X - 停止\n← 上一段  → 下一段\n\n【语速调节】\n↑ 加速  ↓ 减速\n\n【其他】\n点击侧边栏"新手教程"按钮可重新开始教程\nH - 关闭帮助';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.onclick = function() {
      overlay.remove();
      window._helpOverlayOpen = false;
      window.speechSynthesis.cancel();
      refreshAIAssistantAvailability();
    };
    var helpText = '按H键可跳过。快捷键说明。S键朗读总结。E键朗读例题。空格键暂停或继续。X键停止。左箭头上一段。右箭头下一段。上箭头加速。下箭头减速。点击侧边栏新手教程按钮可重新开始教程。H键关闭帮助。';
    window.speechSynthesis.cancel();
    var msg = new SpeechSynthesisUtterance(helpText);
    msg.lang = 'zh-CN'; msg.rate = 0.9;
    msg.onend = function() {
      var el = document.getElementById('help-overlay');
      if(el) el.remove();
      window._helpOverlayOpen = false;
      refreshAIAssistantAvailability();
    };
    window.speechSynthesis.speak(msg);
  }

  if(e.key === 'ArrowUp') { window.increaseRate(); e.preventDefault(); }
  if(e.key === 'ArrowDown') { window.decreaseRate(); e.preventDefault(); }
  if(e.key === ' ' && e.ctrlKey) {
    if (!window._aiAssistantPageEnabled || window._helpOverlayOpen || window._tutorialActive) {
      return;
    }
    // Ctrl+Space → 打开AI助手
    e.preventDefault();
    if(typeof window.openAIAssistant === 'function') window.openAIAssistant();
    return;
  }
  if(e.key === ' ') {
    if(window._waitingForAnswer) { window.speakAnswer(); }
    else if(window.speechSynthesis.paused) { window.speechSynthesis.resume(); }
    else if(window.speechSynthesis.speaking) { window.speechSynthesis.pause(); }
    e.preventDefault();
  }
  if(e.key === 'ArrowLeft') { window.speakPrev(); e.preventDefault(); }
  if(e.key === 'ArrowRight') { window.speakNext(); e.preventDefault(); }
});

// ============== 页面初始化 ==============
// 教程不再自动启动，仅在首次注册登录时由后端传递 show_tutorial 标志触发，
// 或用户主动点击侧边栏"新手教程"按钮时调用 window.startTutorial()。

// ============== 盲人视角聚光灯 ==============
(function() {
  var overlay, toggleBtn, toggleIcon;
  var active = false;
  var rafPending = false;

  function init() {
    overlay = document.getElementById('blind-spotlight-overlay');
    toggleBtn = document.getElementById('blind-spotlight-toggle');
    if (!overlay || !toggleBtn) return;
    toggleIcon = toggleBtn.querySelector('i');

    toggleBtn.addEventListener('click', function() {
      active = !active;
      if (active) {
        overlay.style.display = 'block';
        toggleBtn.classList.add('active');
        toggleBtn.setAttribute('aria-pressed', 'true');
        if (toggleIcon) {
          toggleIcon.className = 'fas fa-eye-slash';
        }
      } else {
        overlay.style.display = 'none';
        toggleBtn.classList.remove('active');
        toggleBtn.setAttribute('aria-pressed', 'false');
        if (toggleIcon) {
          toggleIcon.className = 'fas fa-eye';
        }
      }
    });

    document.addEventListener('mousemove', function(e) {
      if (!active || rafPending) return;
      rafPending = true;
      requestAnimationFrame(function() {
        overlay.style.background =
          'radial-gradient(circle 100px at ' + e.clientX + 'px ' + e.clientY + 'px, ' +
          'transparent 0%, transparent 60%, rgba(0,0,0,0.6) 75%, rgba(0,0,0,0.97) 100%)';
        rafPending = false;
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


// ============== 盲人视角聚光灯 ==============
(function() {
  var overlay, toggleBtn, toggleIcon;
  var active = false;
  var rafPending = false;

  function setActive(on) {
    active = on;
    localStorage.setItem('blind-spotlight', on ? '1' : '0');
    if (on) {
      overlay.style.display = 'block';
      toggleBtn.classList.add('active');
      toggleBtn.setAttribute('aria-pressed', 'true');
      if (toggleIcon) toggleIcon.className = 'fas fa-eye-slash';
    } else {
      overlay.style.display = 'none';
      toggleBtn.classList.remove('active');
      toggleBtn.setAttribute('aria-pressed', 'false');
      if (toggleIcon) toggleIcon.className = 'fas fa-eye';
    }
  }

  function init() {
    overlay = document.getElementById('blind-spotlight-overlay');
    toggleBtn = document.getElementById('blind-spotlight-toggle');
    if (!overlay || !toggleBtn) return;
    toggleIcon = toggleBtn.querySelector('i');

    // 恢复上次的状态
    if (localStorage.getItem('blind-spotlight') === '1') {
      setActive(true);
    }

    toggleBtn.addEventListener('click', function() {
      setActive(!active);
    });

    document.addEventListener('mousemove', function(e) {
      if (!active || rafPending) return;
      rafPending = true;
      requestAnimationFrame(function() {
        overlay.style.background =
          'radial-gradient(circle 100px at ' + e.clientX + 'px ' + e.clientY + 'px, ' +
          'transparent 0%, transparent 60%, rgba(0,0,0,0.6) 75%, rgba(0,0,0,0.97) 100%)';
        rafPending = false;
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
