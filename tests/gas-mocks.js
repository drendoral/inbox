/* Minimal in-memory fakes of the Apps Script services used by Code.gs. */
var GAS = (function () {
  var state;

  function iter(list) {
    var i = 0;
    return { hasNext: function () { return i < list.length; }, next: function () { return list[i++]; } };
  }

  // ---- Docs
  function Paragraph(body, text) { this._body = body; this._text = text; this.heading = 'NORMAL'; }
  Paragraph.prototype.getText = function () { return this._text; };
  Paragraph.prototype.setText = function (t) { this._text = String(t); return this; };
  Paragraph.prototype.setHeading = function (h) { this.heading = h; return this; };
  Paragraph.prototype.getType = function () { return 'PARAGRAPH'; };
  Paragraph.prototype.asParagraph = function () { return this; };
  Paragraph.prototype.removeFromParent = function () {
    var kids = this._body._kids, i = kids.indexOf(this);
    if (i === -1) throw new Error('already removed');
    // Real Google Docs behaviour:
    if (i === kids.length - 1) throw new Error("Can't remove the last paragraph in a document section.");
    kids.splice(i, 1);
    return this;
  };

  function Body(lines) {
    var self = this;
    this._kids = lines.map(function (t) { return new Paragraph(self, t); });
  }
  Body.prototype.getNumChildren = function () { return this._kids.length; };
  Body.prototype.getChild = function (i) { return this._kids[i]; };
  Body.prototype.getChildIndex = function (p) { return this._kids.indexOf(p); };
  Body.prototype.getParagraphs = function () { return this._kids.slice(); };
  Body.prototype.appendParagraph = function (t) {
    if (/[\r\n]/.test(t)) throw new Error('test guard: paragraph text must be one line');
    var p = new Paragraph(this, String(t)); this._kids.push(p); return p;
  };
  Body.prototype.texts = function () { return this._kids.map(function (p) { return p._text; }); };

  // ---- Drive
  var nextId = 1;
  function File(name, content, parent) {
    this.id = 'file' + (nextId++); this.name = name; this.content = content; this.trashed = false; this.parent = parent;
  }
  File.prototype.getName = function () { return this.name; };
  File.prototype.getId = function () { return this.id; };
  File.prototype.isTrashed = function () { return this.trashed; };
  File.prototype.setTrashed = function (v) { this.trashed = !!v; return this; };
  File.prototype.getBlob = function () {
    var c = this.content;
    return { getDataAsString: function () { return c; } };
  };
  File.prototype.moveTo = function (folder) { this.parent = folder; folder.files.push(this); return this; };

  function Folder(name) { this.name = name; this.files = []; this.folders = []; }
  Folder.prototype.getFoldersByName = function (n) {
    return iter(this.folders.filter(function (f) { return f.name === n; }));
  };
  Folder.prototype.createFolder = function (n) { var f = new Folder(n); this.folders.push(f); return f; };
  Folder.prototype.getFiles = function () {
    return iter(this.files.filter(function (f) { return !f.trashed; }));
  };
  Folder.prototype.getFilesByName = function (n) {
    return iter(this.files.filter(function (f) { return !f.trashed && f.name === n; }));
  };
  Folder.prototype.createFile = function (name, content) {
    var f = new File(name, content, this); this.files.push(f); state.allFiles[f.id] = f; return f;
  };

  function reset(docLines) {
    state = {
      props: {},
      triggers: [],
      logs: [],
      sheets: {},
      allFiles: {},
      body: new Body(docLines || [''])
    };
    var main = new Folder('daily in doc');
    var anki = main.createFolder('Anki');
    state.main = main; state.anki = anki;
    state.rootFolders = [main];
    var docFile = main.createFile('daily in doc 001', '');
    state.docId = docFile.id;
    state.doc = {
      getId: function () { return state.docId; },
      getName: function () { return 'daily in doc 001'; },
      getBody: function () { return state.body; }
    };
    if (typeof docCache_ !== 'undefined') docCache_ = null; // eslint-disable-line no-global-assign
    return state;
  }

  var globals = {
    DocumentApp: {
      ElementType: { PARAGRAPH: 'PARAGRAPH' },
      ParagraphHeading: { NORMAL: 'NORMAL' },
      getActiveDocument: function () { return state.doc; },
      openById: function (id) {
        if (id !== state.docId) throw new Error('no doc ' + id);
        return state.doc;
      }
    },
    DriveApp: {
      getFoldersByName: function (n) {
        return iter(state.rootFolders.filter(function (f) { return f.name === n; }));
      },
      getFileById: function (id) {
        if (state.allFiles[id]) return state.allFiles[id];
        throw new Error('no file ' + id);
      }
    },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    PropertiesService: {
      getScriptProperties: function () {
        return {
          getProperty: function (k) { return state.props.hasOwnProperty(k) ? state.props[k] : null; },
          setProperty: function (k, v) { state.props[k] = String(v); return this; },
          deleteProperty: function (k) { delete state.props[k]; return this; }
        };
      }
    },
    ScriptApp: {
      getProjectTriggers: function () { return state.triggers.slice(); },
      deleteTrigger: function (t) { state.triggers.splice(state.triggers.indexOf(t), 1); },
      newTrigger: function (fn) {
        var spec = { fn: fn };
        var b = {
          timeBased: function () { return b; },
          everyHours: function (h) { spec.hours = h; return b; },
          create: function () {
            var t = { spec: spec, getHandlerFunction: function () { return fn; } };
            state.triggers.push(t); return t;
          }
        };
        return b;
      }
    },
    Utilities: {
      getUuid: function () { return crypto.randomUUID(); },
      formatDate: function (date, tz, fmt) {
        var parts = {};
        new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        }).formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
        return fmt.replace('yyyy', parts.year).replace('MM', parts.month).replace('dd', parts.day)
          .replace('HH', parts.hour).replace('mm', parts.minute).replace('ss', parts.second);
      }
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: function (s) {
        return { content: s, setMimeType: function () { return this; }, getContent: function () { return s; } };
      }
    },
    LockService: {
      getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; }
    },
    Logger: {
      log: function (fmt) {
        var args = Array.prototype.slice.call(arguments, 1);
        state.logs.push(String(fmt).replace(/%s/g, function () { return args.shift(); }));
      }
    },
    SpreadsheetApp: {
      create: function (name) {
        var id = 'sheet' + (nextId++);
        var rows = [];
        var ss = {
          rows: rows,
          getId: function () { return id; },
          getSheets: function () { return [{ appendRow: function (r) { rows.push(r); } }]; }
        };
        state.sheets[id] = ss;
        state.allFiles[id] = new File(name, '', null);
        state.allFiles[id].id = id;
        return ss;
      },
      openById: function (id) { if (!state.sheets[id]) throw new Error('no sheet'); return state.sheets[id]; }
    }
  };
  Object.keys(globals).forEach(function (k) { window[k] = globals[k]; });

  return { reset: reset, state: function () { return state; } };
})();
