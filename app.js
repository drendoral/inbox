/* Inbox — UI */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var textEl = $('text'), listEl = $('list'), searchEl = $('search'), toastEl = $('toast');
  var settingsDlg = $('settings'), menuEl = $('menu'), menuBtn = $('menuBtn');
  var PAGE = 20;
  var limit = PAGE;
  var openId = null;
  var lastCount = null;
  var entries = [];

  var ICON_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13l5 5L20 6"/></svg>';
  var ICON_WAIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';

  // ------------------------------------------------------------ helpers
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 1800);
  }
  function focusBox() {
    if (settingsDlg.open) return;
    textEl.focus({ preventScroll: true });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtTime(d) {
    var h = d.getHours() % 12 || 12;
    return pad(h) + ':' + pad(d.getMinutes()) + (d.getHours() < 12 ? ' AM' : ' PM');
  }
  function fmtDate(d) {
    return 'On ' + DAYS[d.getDay()] + ', ' + pad(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function el(tagName, cls, text) {
    var n = document.createElement(tagName);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ------------------------------------------------------------ list
  function render() {
    var q = searchEl.value.trim().toLowerCase();
    var shown = entries.filter(function (e) {
      if (e.status === 'delete') return false;
      return !q || (e.text + ' ' + e.tag).toLowerCase().indexOf(q) !== -1;
    });
    listEl.textContent = '';
    shown.slice(0, limit).forEach(function (e) {
      var li = el('li', 'entry' + (e.id === openId ? ' open' : ''));
      var main = el('button', 'entry-main');
      main.type = 'button';
      main.setAttribute('aria-expanded', String(e.id === openId));
      var txt = el('span', 'entry-text', e.text);
      txt.dir = 'auto';
      main.appendChild(txt);
      main.addEventListener('click', function () {
        openId = openId === e.id ? null : e.id;
        render();
      });
      li.appendChild(main);

      var d = new Date(e.ts);
      var meta = el('div', 'entry-meta');
      var st = el('span', 'state state-' + e.status);
      st.innerHTML = e.status === 'sent' ? ICON_OK + 'Sent'
        : ICON_WAIT + (e.status === 'sending' ? 'Sending…' : 'Waiting to send');
      meta.appendChild(st);
      meta.appendChild(el('span', null, fmtTime(d)));
      meta.appendChild(el('span', null, fmtDate(d)));
      li.appendChild(meta);

      var extra = el('div', 'entry-extra');
      extra.appendChild(el('span', 'tag', e.tag));
      var del = el('button', 'del', 'Delete');
      del.type = 'button';
      del.addEventListener('click', function () { removeEntry(e); });
      extra.appendChild(del);
      li.appendChild(extra);
      listEl.appendChild(li);
    });
    listEl.hidden = shown.length === 0;
    $('empty').hidden = shown.length > 0;
    $('empty').textContent = q ? 'No matches.' : 'Nothing yet. Your phrases will show up here.';
    $('more').hidden = shown.length <= limit;
    renderMenu();
  }

  function reload() {
    return PI.allEntries().then(function (list) { entries = list; render(); });
  }

  function renderMenu() {
    var unsent = entries.filter(function (e) { return e.status !== 'sent'; }).length;
    $('count').textContent = lastCount == null ? '…' : lastCount;
    $('toSend').hidden = !unsent;
    $('toSend').textContent = unsent + (unsent === 1 ? ' entry' : ' entries') + ' still on this phone';
    $('sendNow').hidden = !unsent || !navigator.onLine;
    $('offline').hidden = navigator.onLine;
  }

  function refreshCount() {
    if (!navigator.onLine) return Promise.resolve();
    return PI.count().then(function (n) { lastCount = n; renderMenu(); }, function () {});
  }

  // ------------------------------------------------------------ menu
  function setMenu(open) {
    menuEl.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) refreshCount();
  }
  menuBtn.addEventListener('click', function (ev) { ev.stopPropagation(); setMenu(menuEl.hidden); });
  document.addEventListener('click', function (ev) {
    if (!menuEl.hidden && !menuEl.contains(ev.target)) setMenu(false);
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') setMenu(false); });
  $('sendNow').addEventListener('click', function () { setMenu(false); sync(true); });
  $('openSettings').addEventListener('click', function () { setMenu(false); openSettings(); });

  // ------------------------------------------------------------ sync
  var retryTimer = null;
  function sync(loud) {
    return PI.flush().then(function (r) {
      return reload().then(function () {
        if (r.sent) refreshCount();
        if (loud) toast(r.pending ? 'Some entries are still waiting' : 'All sent');
        scheduleRetry(r.pending > 0);
      });
    }, function (err) {
      reload();
      scheduleRetry(true);
      if (err.message === 'unauthorized') toast('Token rejected. Check ☰ › Connection settings', 3500);
      else if (err.message === 'not_configured') openSettings();
      else if (loud) toast('Could not send right now. Will retry.');
    });
  }
  function scheduleRetry(needed) {
    clearTimeout(retryTimer);
    if (needed) retryTimer = setTimeout(sync, navigator.onLine ? 30000 : 120000);
  }
  function requestBackgroundSync() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.sync) return reg.sync.register('phrase-sync');
    }).catch(function () {});
  }

  // ------------------------------------------------------------ actions
  function post() {
    stopListening();
    var text = textEl.value.trim();
    if (!text) { focusBox(); return; }
    textEl.value = '';
    focusBox();
    PI.addEntry({ text: text, tag: guessTag(text), context: '' }).then(function () {
      if (navigator.vibrate) navigator.vibrate(12);
      toast(navigator.onLine ? 'Posted' : 'Saved. Will send when online');
      requestBackgroundSync();
      openId = null;
      return reload().then(function () { sync(); });
    }).catch(function (err) {
      textEl.value = text;
      toast('Could not save: ' + err.message, 3000);
    });
  }

  function removeEntry(e) {
    var short = e.text.length > 60 ? e.text.slice(0, 57) + '…' : e.text;
    if (!confirm('Delete this entry from the app and the doc?\n\n' + short)) return;
    openId = null;
    PI.deleteEntry(e.id).then(reload).then(function () {
      toast(navigator.onLine ? 'Deleted' : 'Will delete from the doc when online');
      requestBackgroundSync();
      return sync();
    });
  }

  $('composer').addEventListener('submit', function (ev) { ev.preventDefault(); post(); });
  textEl.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); post(); }
  });
  searchEl.addEventListener('input', function () { limit = PAGE; render(); });
  $('more').addEventListener('click', function () { limit += PAGE; render(); });

  // ------------------------------------------------------------ hold-to-talk
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var micBtn = $('mic');
  var holding = false, rec = null, pressedAt = 0, heardSomething = false;

  function setMicUi(on) {
    micBtn.classList.toggle('on', on);
    $('listening').hidden = !on;
  }

  function startSession() {
    // One recognition session per phrase; restarted while the button is held
    // (Android ends a session after a short pause).
    var base = textEl.value;
    if (base && !/\s$/.test(base)) base += ' ';
    rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = function (ev) {
      var said = '';
      for (var i = 0; i < ev.results.length; i++) said += ev.results[i][0].transcript;
      said = said.trim();
      if (said) heardSomething = true;
      if (!base.trim() && said) said = said.charAt(0).toUpperCase() + said.slice(1);
      textEl.value = base + said;
      textEl.scrollTop = textEl.scrollHeight;
    };
    rec.onerror = function (ev) {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        holding = false;
        toast('Microphone is blocked. Allow it in Chrome site settings.', 3500);
      } else if (ev.error === 'network') {
        holding = false;
        toast('Voice needs an internet connection.', 3000);
      }
    };
    rec.onend = function () {
      rec = null;
      if (holding) { try { startSession(); return; } catch (err) { holding = false; } }
      setMicUi(false);
      var len = textEl.value.length;
      textEl.setSelectionRange(len, len);
    };
    try { rec.start(); } catch (err) { rec = null; setMicUi(false); }
  }

  function stopListening() {
    holding = false;
    if (rec) { try { rec.stop(); } catch (err) { /* already stopped */ } }
  }

  if (!SR) {
    micBtn.addEventListener('click', function () {
      toast('Voice typing is not supported in this browser. Use Chrome.', 3000);
    });
  } else {
    micBtn.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      if (holding) return;
      try { micBtn.setPointerCapture(ev.pointerId); } catch (err) { /* ignore */ }
      holding = true;
      heardSomething = false;
      pressedAt = Date.now();
      setMicUi(true);
      if (navigator.vibrate) navigator.vibrate(15);
      if (!rec) startSession();
    });
    var release = function () {
      if (!holding) return;
      stopListening();
      if (Date.now() - pressedAt < 400 && !heardSomething) toast('Hold the mic while you speak');
    };
    micBtn.addEventListener('pointerup', release);
    micBtn.addEventListener('pointercancel', release);
    micBtn.addEventListener('lostpointercapture', release);
    micBtn.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  }

  // ------------------------------------------------------------ settings
  function openSettings() {
    if (settingsDlg.open) return;
    PI.getSettings().then(function (s) {
      $('setUrl').value = s.url;
      $('setToken').value = s.token;
      $('settingsMsg').textContent = '';
      $('settingsMsg').className = 'msg';
      $('cancelSettings').hidden = !(s.url && s.token);
      settingsDlg.showModal();
    });
  }
  $('cancelSettings').addEventListener('click', function () { settingsDlg.close(); focusBox(); });
  settingsDlg.addEventListener('cancel', function (ev) {
    if ($('cancelSettings').hidden) ev.preventDefault(); // must connect first
  });

  $('settingsForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var cfg = { url: $('setUrl').value.trim(), token: $('setToken').value.trim() };
    var msg = $('settingsMsg');
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(cfg.url)) {
      msg.className = 'msg err';
      msg.textContent = 'The URL should start with https://script.google.com/ and end with /exec';
      return;
    }
    msg.className = 'msg';
    msg.textContent = 'Testing connection…';
    $('saveSettings').disabled = true;
    PI.ping(cfg).then(function (r) {
      return PI.saveSettings(cfg).then(function () {
        msg.className = 'msg ok';
        msg.textContent = 'Connected to “' + r.doc + '”.';
        setTimeout(function () { settingsDlg.close(); focusBox(); }, 700);
        refreshCount();
        sync();
      });
    }, function (err) {
      msg.className = 'msg err';
      msg.textContent = err.message === 'unauthorized' ? 'Wrong token.'
        : 'Could not reach the script (' + err.message + '). Check the URL and that you are online.';
    }).then(function () { $('saveSettings').disabled = false; });
  });

  // ------------------------------------------------------------ online / offline
  function onNet() {
    renderMenu();
    if (navigator.onLine) { sync(); refreshCount(); }
  }
  window.addEventListener('online', onNet);
  window.addEventListener('offline', onNet);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { focusBox(); reload(); sync(); refreshCount(); }
    else stopListening();
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (ev) {
      if (ev.data === 'synced') { reload(); refreshCount(); }
    });
  }

  // ------------------------------------------------------------ share target
  function takeShared() {
    var params = new URLSearchParams(location.search);
    // The shared text is the phrase; the title (usually a page name) or the
    // link are only used when nothing else was shared.
    var shared = [params.get('text'), params.get('title'), params.get('url')]
      .map(function (s) { return (s || '').trim(); })
      .filter(Boolean)[0];
    if (shared) textEl.value = shared;
    if (location.search) history.replaceState(null, '', location.pathname);
  }

  // ------------------------------------------------------------ start
  takeShared();
  focusBox();
  textEl.setSelectionRange(textEl.value.length, textEl.value.length);
  reload().then(function () {
    return PI.getSettings();
  }).then(function (s) {
    if (!s.url || !s.token) openSettings();
    else { sync(); refreshCount(); }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
