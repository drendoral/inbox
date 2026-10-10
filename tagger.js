/* Guesses a tag from the text. Simple rules, no internet needed. */
var guessTag = (function () {
  var WORK = [
    'meeting', 'meetings', 'client', 'clients', 'customer', 'customers', 'deadline', 'deadlines',
    'boss', 'manager', 'project', 'projects', 'email', 'emails', 'report', 'reports', 'colleague',
    'colleagues', 'coworker', 'coworkers', 'co-worker', 'office', 'shift', 'shifts', 'invoice',
    'agenda', 'salary', 'payroll', 'team', 'teammate', 'supervisor', 'contract', 'budget',
    'presentation', 'interview', 'workplace', 'onboarding', 'quarterly', 'stakeholder', 'kpi',
    'safety', 'hr', 'overtime', 'schedule', 'workload', 'task', 'tasks'
  ];
  var WORK_PHRASES = ['touch base', 'follow up', 'circle back', 'heads up', 'loop in', 'sign off',
    'action item', 'out of office', 'on the same page', 'at work', 'my job'];
  // Words that show a full sentence rather than the name of a thing.
  var SENTENCE = ['i', "i'm", "i've", "i'll", 'you', "you're", 'he', "he's", 'she', "she's", 'we',
    'they', "it's", 'my', 'your', 'his', 'her', 'our', 'their', 'me', 'him', 'us', 'them',
    'is', 'are', 'was', 'were', 'do', 'does', 'did', "don't", "can't", 'will', 'would', 'should',
    "let's", 'please', 'just'];

  return function (text) {
    var t = String(text || '').toLowerCase().replace(/[’‘]/g, "'").trim();
    var words = t.split(/[^a-z0-9'\-]+/).filter(Boolean);
    if (!words.length) return "Couldn't say";
    if (words.some(function (w) { return WORK.indexOf(w) !== -1; }) ||
        WORK_PHRASES.some(function (p) { return t.indexOf(p) !== -1; })) return 'Work';
    if (words.length <= 3 && !/[.!?]$/.test(t) &&
        !words.some(function (w) { return SENTENCE.indexOf(w) !== -1; })) return 'Word for a thing';
    return "Couldn't say";
  };
})();
