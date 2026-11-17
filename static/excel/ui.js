/*
 * Quadra Office - user interface layer.
 *
 * Loaded before script.js. script.js calls QuadraUI.init(core) once the grid exists.
 * The grid logic lives in script.js; this file only builds the chrome and routes commands:
 *   QuadraUI.ribbonHtml(tab)     -> markup for a ribbon tab
 *   QuadraUI.command(cmd, val)   -> true when this file handled the command
 */
(function () {
  "use strict";

  // ---------- Settings you can change ----------
  // The 9-dot launcher opens these. Set `url` to the deployed location of each app.
  const APPS = [
    { name: "Excel", icon: "appExcel", url: null, current: true },
    { name: "Word", icon: "appWord", url: "../quadra-word/index.html" },
    { name: "PowerPoint", icon: "appPpt", url: "../quadra-powerpoint/index.html" },
    { name: "Outlook", icon: "appOutlook", url: "../quadra-outlook/index.html" },
    { name: "OneDrive", icon: "appDrive", url: "../quadra-drive/index.html" },
    { name: "OneNote", icon: "appNotes", url: "../quadra-notes/index.html" }
  ];

  const AUTOSAVE_KEY = "quadra.workbook.v1";
  const NAME_KEY = "quadra.docName";
  const THEME_KEY = "quadra.theme";

  const THEMES = {
    light: {
      cell: "#ffffff", text: "#201f1e", grid: "#e1dfdd", accent: "#107c41",
      header: "#f5f5f5", headerSel: "#e3f1e9", headerText: "#5b5b5b", headerLine: "#cfcfcf",
      selTint: "rgba(16,124,65,0.12)", border: "#323130"
    },
    dark: {
      cell: "#1b1b1b", text: "#f0f0f0", grid: "#343434", accent: "#3fb97a",
      header: "#262626", headerSel: "#1f3a2c", headerText: "#bdbdbd", headerLine: "#4a4a4a",
      selTint: "rgba(63,185,122,0.18)", border: "#d6d6d6"
    }
  };

  const FONTS = [["Calibri", "Calibri"], ["Arial", "Arial"], ["Times New Roman", "Times New Roman"],
    ["Courier New", "Courier New"], ["Verdana", "Verdana"], ["Georgia", "Georgia"]];
  const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72].map((n) => [String(n), String(n)]);
  const NUMBER_FORMATS = [["general", "General"], ["number", "Number"], ["currency", "Currency"], ["percent", "Percentage"]];

  // Functions the formula engine supports. category is used by the Formulas tab menus.
  const FUNCS = [
    ["SUM", "Math & Trig", "Adds the numbers in a range"],
    ["ROUND", "Math & Trig", "Rounds a number to a number of digits"],
    ["ABS", "Math & Trig", "Absolute value of a number"],
    ["INT", "Math & Trig", "Rounds a number down to the nearest integer"],
    ["SQRT", "Math & Trig", "Square root of a number"],
    ["POWER", "Math & Trig", "Raises a number to a power"],
    ["MOD", "Math & Trig", "Remainder after division"],
    ["PI", "Math & Trig", "The value of pi"],
    ["AVERAGE", "Statistical", "Average of the numbers in a range"],
    ["MIN", "Statistical", "Smallest number in a range"],
    ["MAX", "Statistical", "Largest number in a range"],
    ["COUNT", "Statistical", "Counts the numbers in a range"],
    ["COUNTA", "Statistical", "Counts the non-empty cells in a range"],
    ["IF", "Logical", "Returns one value if a condition is true, another if false"],
    ["IFERROR", "Logical", "Returns an alternative value when a formula errors"],
    ["AND", "Logical", "TRUE if all arguments are TRUE"],
    ["OR", "Logical", "TRUE if any argument is TRUE"],
    ["NOT", "Logical", "Reverses a logical value"],
    ["CONCATENATE", "Text", "Joins several text values"],
    ["CONCAT", "Text", "Joins several text values"],
    ["LEN", "Text", "Number of characters in text"],
    ["UPPER", "Text", "Converts text to upper case"],
    ["LOWER", "Text", "Converts text to lower case"],
    ["TRIM", "Text", "Removes extra spaces from text"],
    ["LEFT", "Text", "Leftmost characters of text"],
    ["RIGHT", "Text", "Rightmost characters of text"],
    ["MID", "Text", "Characters from the middle of text"]
  ];

  // ---------- Small helpers ----------
  let core = null;
  let currentTab = "Home";
  const wrap = document.getElementById("gridWrap");
  // Grid geometry; must match the constants at the top of script.js
  const HDR_W = 40, HDR_H = 20, COL_W = 64, ROW_H = 20;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ic = (name, cls) => `<svg class="${cls || "ic"}"><use href="#i-${name}"/></svg>`;
  const engine = () => window.QEngine;

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyText(text, doneMsg) {
    const fallback = () => {
      const t = document.createElement("textarea");
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
      core.toast(doneMsg);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => core.toast(doneMsg), fallback);
    } else {
      fallback();
    }
  }

  function docName() {
    return ($("docName").textContent || "Book 1").trim() || "Book 1";
  }

  function safeFileName(name, ext) {
    return name.replace(/[\\/:*?"<>|]+/g, "_") + ext;
  }

  // ---------- Ribbon definitions ----------
  // Item kinds:
  //   bg  = big button (icon above label)      sm = small button
  //   sel = dropdown list                      rw = row of items   stk = vertical stack of items
  //   A button with `menu` opens a popup list instead of running a command.
  const bg = (cmd, label, icon, o = {}) => ({ kind: "bg", cmd, label, icon, ...o });
  const sm = (cmd, label, icon, o = {}) => ({ kind: "sm", cmd, label, icon, ...o });
  const sel = (cmd, id, pairs, width, o = {}) => ({ kind: "sel", cmd, id, pairs, width, ...o });
  const rw = (...items) => ({ kind: "rw", items });
  const stk = (...items) => ({ kind: "stk", items });
  const grp = (name, ...items) => ({ name, items });

  const TABS = {
    Home: [
      grp("Undo", rw(sm("undo", "", "undo", { title: "Undo (Ctrl+Z)" }), sm("redo", "", "redo", { title: "Redo (Ctrl+Y)" }))),
      grp("Clipboard",
        bg("paste", "Paste", "paste", { title: "Paste (Ctrl+V)" }),
        stk(sm("cut", "Cut", "cut", { title: "Cut (Ctrl+X)" }), sm("copy", "Copy", "copy", { title: "Copy (Ctrl+C)" }),
          sm("painter", "Format Painter", "painter", { tgl: "painter" }))),
      grp("Font",
        stk(
          rw(sel("font", "fontFamily", FONTS, 118, { title: "Font" }), sel("size", "fontSize", SIZES, 52, { title: "Font size" }),
            sm("sizeUp", "", "fontGrow", { title: "Increase font size" }), sm("sizeDown", "", "fontShrink", { title: "Decrease font size" })),
          rw(sm("bold", "", "bold", { tgl: "bold", title: "Bold (Ctrl+B)" }), sm("italic", "", "italic", { tgl: "italic", title: "Italic (Ctrl+I)" }),
            sm("underline", "", "underline", { tgl: "underline", title: "Underline (Ctrl+U)" }),
            sm("", "", "borders", { menu: "borders", title: "Borders" }),
            sm("fill", "", "fill", { title: "Fill color" }), sm("fontColor", "", "fontColor", { title: "Font color" })))),
      grp("Alignment",
        stk(
          rw(sm("va", "", "alignTop", { val: "top", title: "Top align" }), sm("va", "", "alignMid", { val: "middle", title: "Middle align" }),
            sm("va", "", "alignBot", { val: "bottom", title: "Bottom align" })),
          rw(sm("ha", "", "alignLeft", { val: "left", title: "Align left" }), sm("ha", "", "alignCenter", { val: "center", title: "Center" }),
            sm("ha", "", "alignRight", { val: "right", title: "Align right" }))),
        stk(rw(sm("indentIn", "", "indentIn", { title: "Decrease indent" }), sm("indentOut", "", "indentOut", { title: "Increase indent" }),
          sm("", "", "orient", { menu: "orient", title: "Orientation" }))),
        stk(sm("wrap", "Wrap Text", "wrap", { tgl: "wrap" }), sm("merge", "Merge & Center", "merge"))),
      grp("Number",
        stk(sel("nf", "numFmt", NUMBER_FORMATS, 118, { title: "Number format" }),
          rw(sm("nf", "", "currency", { val: "currency", title: "Currency" }), sm("nf", "", "percent", { val: "percent", title: "Percent style" }),
            sm("nf", "", "comma", { val: "number", title: "Comma style" }), sm("decUp", "", "decInc", { title: "Increase decimal" }),
            sm("decDown", "", "decDec", { title: "Decrease decimal" })))),
      grp("Styles",
        stk(sm("", "Conditional Formatting", "condFormat", { menu: "condFormat" }), sm("table", "Format as Table", "table"),
          sm("", "Cell Styles", "cellStyles", { menu: "cellStyles" }))),
      grp("Cells", bg("", "Insert", "insertCells", { menu: "insertCells" }), bg("", "Delete", "deleteCells", { menu: "deleteCells" }),
        bg("formatCells", "Format", "formatCells")),
      grp("Editing",
        stk(sm("autoSum", "AutoSum", "sum"), sm("", "Fill", "fillDown", { menu: "fill" }), sm("clearAll", "Clear", "clear")),
        bg("", "Sort & Filter", "sortAsc", { menu: "sort" }),
        bg("", "Find & Select", "find", { menu: "find" })),
      grp("Add-ins", bg("addins", "Add-ins", "addins"))
    ],

    Insert: [
      grp("Tables",
        bg("", "PivotTable", "pivot", { menu: "pivot" }),
        bg("table", "Table", "table", { title: "Format the selection as a table" }),
        bg("", "Forms", "forms", { menu: "forms" })),
      grp("Illustrations", bg("", "Pictures", "pictures", { menu: "pictures" }), bg("", "Shapes", "shapes", { menu: "shapes" })),
      grp("Controls", bg("checkbox", "Checkbox", "checkbox")),
      grp("Charts",
        bg("chart", "Column", "chartColumn", { val: "column" }),
        bg("chart", "Line", "chartLine", { val: "line" }),
        bg("chart", "Scatter", "chartScatter", { val: "scatter" }),
        bg("chart", "Pie", "chartPie", { val: "pie" }),
        bg("chart", "Bar", "chartBar", { val: "bar" }),
        bg("chart", "Statistical", "chartStat", { val: "histogram" }),
        bg("chart", "Combo", "chartCombo", { val: "combo" }),
        bg("", "Other Charts", "chartOther", { menu: "chartOther" })),
      grp("Filters", bg("slicer", "Slicer", "slicer", { disabled: 1 })),
      grp("Links", bg("hyperlink", "Link", "link")),
      grp("Comments", bg("newComment", "New Comment", "commentNew")),
      grp("Text", bg("textBox", "Text Box", "textBox"))
    ],

    Share: [
      grp("Share", bg("shareBook", "Share", "share"), bg("copyLink", "Copy Link", "copyLink"), bg("linkSheet", "Link to this Sheet", "linkSheet"))
    ],

    "Page Layout": [
      grp("Themes", bg("", "Themes", "theme", { menu: "pageTheme" }),
        stk(sm("", "Colors", "theme", { menu: "colors" }), sm("", "Fonts", "fontColor", { menu: "fonts" }))),
      grp("Page Setup",
        bg("", "Margins", "formatCells", { menu: "margins" }), bg("", "Orientation", "orient", { menu: "orientation" }),
        bg("", "Size", "file", { menu: "paperSize" }), bg("", "Print Area", "formatCells", { menu: "printArea" }),
        bg("", "Breaks", "headings", { menu: "breaks" }), bg("", "Background", "pictures", { menu: "background" }),
        bg("printTitles", "Print Titles", "headings")),
      grp("Scale to Fit",
        stk(sel("scaleW", null, [["auto", "Width: Automatic"], ["1", "Width: 1 page"]], 150),
          sel("scaleH", null, [["auto", "Height: Automatic"], ["1", "Height: 1 page"]], 150),
          sel("scale", null, [["100", "Scale: 100%"], ["75", "Scale: 75%"], ["50", "Scale: 50%"]], 150))),
      grp("Sheet Options",
        stk(rw(sm("sheetOpt", "Gridlines", "gridlines", { val: "gridView" }), sm("sheetOpt", "Print", "print", { val: "gridPrint" })),
          rw(sm("sheetOpt", "Headings", "headings", { val: "headingsView" }), sm("sheetOpt", "Print", "print", { val: "headingsPrint" })))),
      grp("Arrange", bg("", "Align", "alignMid", { menu: "align" }), bg("rotateObject", "Rotate", "orient"),
        bg("sendBack", "Send to Back", "formatCells"))
    ],

    Formulas: [
      grp("Function Library",
        bg("insertFn", "Insert Function", "fx"),
        stk(sm("autoSum", "AutoSum", "sum"), sm("", "Recently Used", "fxRecent", { menu: "fnRecent" })),
        stk(sm("", "Financial", "fxFinance", { menu: "fnFinancial" }), sm("", "Logical", "fxLogical", { menu: "fnLogical" })),
        stk(sm("", "Text", "fxText", { menu: "fnText" }), sm("", "Date & Time", "fxDate", { menu: "fnDate" })),
        stk(sm("", "Lookup & Reference", "fxLookup", { menu: "fnLookup" }), sm("", "Math & Trig", "fxMath", { menu: "fnMath" })),
        bg("", "More Functions", "fxMore", { menu: "fnMore" })),
      grp("Defined Names",
        bg("nameManager", "Name Manager", "nameManager"),
        stk(sm("defineName", "Define Name", "pencil"), sm("useInFormula", "Use in Formula", "fx"),
          sm("createFromSelection", "Create from Selection", "table"))),
      grp("Formula Auditing",
        stk(sm("tracePrecedents", "Trace Precedents", "gridlines"), sm("traceDependents", "Trace Dependents", "gridlines"),
          sm("removeArrows", "Remove Arrows", "clear")),
        bg("showFormulas", "Show Formulas", "showFormulas", { tgl: "showFormulas" }),
        stk(sm("errorChecking", "Error Checking", "spelling"), sm("evaluateFormula", "Evaluate Formula", "calc"))),
      grp("Calculation",
        bg("", "Calculation Options", "calc", { menu: "calcOptions" }),
        stk(sm("calcBook", "Calculate Workbook", "calc"), sm("calcSheet", "Calculate Sheet", "calc")))
    ],

    Data: [
      grp("Get & Transform Data",
        bg("", "Get Data", "queries", { menu: "getData" }),
        stk(sm("recentSources", "Recent Sources", "version"), sm("fromTable", "From Table", "table"))),
      grp("Queries & Connections",
        bg("refreshAll", "Refresh All", "refresh", { menu: "refresh" }),
        stk(sm("queries", "Queries & Connections", "queries"), sm("workbookLinks", "Workbook Links", "workbookLinks"))),
      grp("Data Types", bg("", "Data Types", "dataTypes", { menu: "dataTypes" })),
      grp("Sort & Filter",
        bg("sortAsc", "Sort A to Z", "sortAsc"), bg("sortDesc", "Sort Z to A", "sortDesc"),
        bg("customSort", "Custom Sort", "customSort"), bg("filter", "Filter", "filter"),
        stk(sm("clearSort", "Clear", "clear"), sm("reapply", "Reapply", "refresh"))),
      grp("Data Tools",
        bg("", "Data Tools", "dataTools", { menu: "dataTools" })),
      grp("Forecast", bg("", "What-If Analysis", "whatIf", { menu: "whatIf" }), bg("forecast", "Forecast Sheet", "forecast")),
      grp("Outline", bg("", "Outline", "outline", { menu: "outline" }))
    ],

    Review: [
      grp("Comments",
        bg("newComment", "New Comment", "commentNew"),
        stk(sm("prevComment", "Previous", "prevComment"), sm("nextComment", "Next", "nextComment"),
          sm("deleteComment", "Delete", "delComment")),
        bg("showAllComments", "Show Comments", "showComments")),
      grp("Changes", bg("showChanges", "Show Changes", "showChanges"), bg("version", "Version History", "version")),
      grp("Proofing",
        bg("spelling", "Spelling", "spelling"),
        bg("", "Accessibility", "accessibility", { menu: "access" }),
        bg("stats", "Workbook Statistics", "stats")),
      grp("Protection",
        bg("protectSheet", "Manage Protection", "protect", { tgl: "protect" }),
        bg("pauseProtection", "Pause Protection", "pauseProtect")),
      grp("Notes", bg("newComment", "Notes", "notes"))
    ],

    View: [
      grp("Sheet View",
        bg("", "Sheet View", "sheetView", { menu: "sheetView" }),
        stk(sm("saveView", "Save", "save"), sm("newView", "New", "newFile"), sm("viewOptions", "Options", "options"))),
      grp("Zoom",
        stk(sel("zoomSel", null, [["100", "100%"], ["75", "75%"], ["50", "50%"], ["150", "150%"]], 92), sm("zoom100", "100%", "zoom100")),
        bg("zoom", "Zoom", "zoom")),
      grp("Window",
        bg("newWindow", "New Window", "newWindow"),
        bg("", "Freeze Panes", "freeze", { menu: "freeze" }),
        bg("fullscreen", "Full Screen", "fullscreen")),
      grp("Navigation", bg("navigation", "Navigation", "navigation")),
      grp("Show",
        stk(sm("sheetOpt", "Headings", "headings", { val: "headingsView" }),
          sm("sheetOpt", "Gridlines", "gridlines", { val: "gridView" }),
          sm("sheetOpt", "Formula Bar", "formulaBar", { val: "formulaBar" }))),
      grp("Focus", bg("focusCell", "Focus Cell", "focusCell")),
      grp("Views", bg("immersive", "Immersive Reader", "immersive"))
    ],

    Help: [
      grp("Help",
        bg("help", "Help", "help"),
        bg("shortcuts", "Keyboard Shortcuts", "keyboard"),
        bg("functionList", "Function List", "fx")),
      grp("What's New", bg("whatsNew", "What's New", "whatsNew")),
      grp("Support & Feedback", bg("feedback", "Feedback", "feedback"))
    ],

    Draw: [
      grp("Drawing Tools",
        bg("draw", "Pointer", "pointer", { val: "pointer" }),
        bg("draw", "Pen", "pen", { val: "pen" }),
        bg("draw", "Red Pen", "pen", { val: "penRed" }),
        bg("draw", "Highlighter", "highlighter", { val: "highlighter" }),
        bg("draw", "Eraser", "eraser", { val: "eraser" })),
      grp("Input Mode", bg("drawTouch", "Draw with Touch", "touch"))
    ]
  };

  // ---------- Ribbon rendering ----------
  function attrs(x) {
    const a = [];
    if (x.cmd) a.push(`data-cmd="${esc(x.cmd)}"`);
    if (x.val !== undefined) a.push(`data-val="${esc(x.val)}"`);
    if (x.menu) a.push(`data-menu="${esc(x.menu)}"`);
    if (x.tgl) a.push(`data-tgl="${esc(x.tgl)}"`);
    if (x.disabled) a.push("disabled");
    return a.join(" ");
  }

  function bigHtml(x) {
    return `<button class="bg" ${attrs(x)} title="${esc(x.title || x.label)}">${ic(x.icon)}` +
      `<span>${esc(x.label)}</span>${x.menu ? ic("chevDown", "ic caret") : ""}</button>`;
  }

  function smallHtml(x) {
    const label = x.label ? `<span>${esc(x.label)}</span>` : "";
    return `<button class="sm${x.label ? "" : " icon-only"}" ${attrs(x)} title="${esc(x.title || x.label || x.cmd || "")}">` +
      `${x.icon ? ic(x.icon) : ""}${label}${x.menu && x.label ? ic("chevDown", "ic caret") : ""}</button>`;
  }

  function selHtml(x) {
    const opts = x.pairs.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");
    return `<select class="sel" ${x.id ? `id="${esc(x.id)}"` : ""} data-cmd="${esc(x.cmd)}" ` +
      `style="width:${x.width}px" title="${esc(x.title || x.cmd)}">${opts}</select>`;
  }

  function itemHtml(x) {
    switch (x.kind) {
      case "bg": return bigHtml(x);
      case "sm": return smallHtml(x);
      case "sel": return selHtml(x);
      case "rw": return `<div class="rw">${x.items.map(itemHtml).join("")}</div>`;
      case "stk": return `<div class="stk">${x.items.map(itemHtml).join("")}</div>`;
      default: return "";
    }
  }

  function groupHtml(g) {
    return `<div class="grp"><div class="gbody">${g.items.map(itemHtml).join("")}</div>` +
      `<div class="gname">${esc(g.name)}</div></div>`;
  }

  function ribbonHtml(tab) {
    // "File" opens the backstage; the ribbon keeps showing the last real tab.
    if (tab === "File") tab = currentTab;
    else currentTab = tab;
    const groups = TABS[tab];
    if (!groups) return `<div class="placeholder">${esc(tab)}</div>`;
    return groups.map(groupHtml).join("");
  }

  // ---------- Popup menus ----------
  const fnItems = (cat) => {
    const list = FUNCS.filter((f) => f[1] === cat).map((f) => ({ label: f[0], cmd: "fnInsert", val: f[0] }));
    return list.length ? list : [{ label: "No functions in this version", disabled: true }];
  };

  const MENUS = {
    borders: [{ label: "All Borders", cmd: "border", val: "all" }, { label: "No Border", cmd: "border", val: "none" }],
    fill: [{ label: "Down  (Ctrl+D)", cmd: "fillDown" }, { label: "Right", cmd: "fillRight" }, { label: "Series…", cmd: "series" }],
    sort: [{ label: "Sort A to Z", cmd: "sortAsc" }, { label: "Sort Z to A", cmd: "sortDesc" },
      { sep: true }, { label: "Remove Duplicates", cmd: "removeDuplicates" }, { label: "Filter", cmd: "filter" }],
    find: [{ label: "Find…", cmd: "find", hint: "Ctrl+F" }, { label: "Replace…", cmd: "replace" }, { label: "Go To…", cmd: "goto" }],
    pivot: [{ label: "PivotTable…", cmd: "pivot" }, { label: "Recommended PivotTables…", cmd: "pivot", val: "recommended" }],
    forms: [{ label: "Form Control (checkbox)", cmd: "checkbox" }],
    pictures: [{ label: "This Device…", cmd: "picturesFile" }, { label: "Online Pictures", cmd: "onlinePics" }],
    shapes: [{ label: "Rectangle", cmd: "shape", val: "rect" }, { label: "Oval", cmd: "shape", val: "oval" }, { label: "Arrow", cmd: "shape", val: "arrow" }],
    chartOther: [{ label: "Histogram", cmd: "chart", val: "histogram" }],
    align: [{ label: "Align Left", cmd: "ha", val: "left" }, { label: "Align Center", cmd: "ha", val: "center" }, { label: "Align Right", cmd: "ha", val: "right" }],
    insertCells: [{ label: "Insert Sheet Rows", cmd: "insertRows" }, { label: "Insert Sheet Columns", cmd: "insertCols" }],
    deleteCells: [{ label: "Delete Sheet Rows", cmd: "deleteRows" }, { label: "Delete Sheet Columns", cmd: "deleteCols" }],
    condFormat: [
      { label: "Greater Than…", cmd: "cfRule", val: "gt" }, { label: "Less Than…", cmd: "cfRule", val: "lt" },
      { label: "Equal To…", cmd: "cfRule", val: "eq" }, { label: "Between…", cmd: "cfRule", val: "between" },
      { label: "Text Contains…", cmd: "cfRule", val: "contains" }, { sep: true },
      { label: "Clear Rules from Selection", cmd: "cfClear" }
    ],
    cellStyles: [
      { label: "Normal", cmd: "style", val: "normal" }, { label: "Heading", cmd: "style", val: "heading" },
      { label: "Title", cmd: "style", val: "title" }, { sep: true },
      { label: "Good", cmd: "style", val: "good" }, { label: "Bad", cmd: "style", val: "bad" },
      { label: "Neutral", cmd: "style", val: "neutral" }, { label: "Input", cmd: "style", val: "input" }
    ],
    orient: [
      { label: "Angle Counterclockwise", cmd: "angle", val: 45 }, { label: "Angle Clockwise", cmd: "angle", val: -45 },
      { label: "Rotate Text Up", cmd: "angle", val: 90 }, { label: "Rotate Text Down", cmd: "angle", val: -90 },
      { label: "Horizontal Text", cmd: "angle", val: 0 }, { sep: true },
      { label: "Format Cell Alignment…", cmd: "formatCells" }
    ],
    pageTheme: [
      { label: "Office", cmd: "pageTheme", val: "office" }, { label: "Ocean", cmd: "pageTheme", val: "ocean" },
      { label: "Warm", cmd: "pageTheme", val: "warm" }, { label: "Mono", cmd: "pageTheme", val: "mono" }
    ],
    colors: [
      { label: "Green", cmd: "accent", val: "#107c41" }, { label: "Blue", cmd: "accent", val: "#0f6cbd" },
      { label: "Orange", cmd: "accent", val: "#c43e1c" }, { label: "Grey", cmd: "accent", val: "#605e5c" }
    ],
    fonts: [
      { label: "Calibri", cmd: "defaultFont", val: "Calibri" }, { label: "Georgia", cmd: "defaultFont", val: "Georgia" },
      { label: "Arial", cmd: "defaultFont", val: "Arial" }, { label: "Courier New", cmd: "defaultFont", val: "Courier New" }
    ],
    margins: [
      { label: "Normal", cmd: "margins", val: "normal" }, { label: "Wide", cmd: "margins", val: "wide" },
      { label: "Narrow", cmd: "margins", val: "narrow" }
    ],
    orientation: [{ label: "Portrait", cmd: "orientation", val: "portrait" }, { label: "Landscape", cmd: "orientation", val: "landscape" }],
    paperSize: [{ label: "A4", cmd: "paperSize", val: "A4" }, { label: "Letter", cmd: "paperSize", val: "Letter" }, { label: "Legal", cmd: "paperSize", val: "Legal" }],
    printArea: [{ label: "Set Print Area", cmd: "printArea", val: "set" }, { label: "Clear Print Area", cmd: "printArea", val: "clear" }],
    breaks: [
      { label: "Insert Page Break", cmd: "breaks", val: "insert" }, { label: "Remove Page Break", cmd: "breaks", val: "remove" },
      { label: "Reset All Page Breaks", cmd: "breaks", val: "reset" }
    ],
    background: [{ label: "Choose a picture…", cmd: "background", val: "insert" }, { label: "Remove Background", cmd: "background", val: "remove" }],
    themes: [{ label: "Office", cmd: "themeOffice" }],
    calcOptions: [{ label: "Automatic", cmd: "calcBook" }, { label: "Manual", cmd: "calcManual" }],
    getData: [{ label: "From Text/CSV", cmd: "fromText" }, { label: "From Web", cmd: "fromWeb" }, { label: "From Access", cmd: "fromAccess" }],
    refresh: [{ label: "Refresh", cmd: "refreshAll" }, { label: "Refresh All", cmd: "refreshAll" }],
    dataTypes: [{ label: "Stocks", cmd: "dataTypes" }, { label: "Geography", cmd: "dataTypes" }],
    dataTools: [{ label: "Remove Duplicates", cmd: "removeDuplicates" }, { label: "Data Validation", cmd: "dataValidation" },
      { label: "Consolidate", cmd: "consolidate" }, { label: "Relationships", cmd: "relationships" }],
    whatIf: [{ label: "Goal Seek", cmd: "goalSeek" }, { label: "Scenario Manager", cmd: "scenarios" }, { label: "Data Table", cmd: "dataTable" }],
    outline: [{ label: "Group", cmd: "group" }, { label: "Ungroup", cmd: "ungroup" }, { label: "Subtotal", cmd: "subtotal" }],
    freeze: [{ label: "Freeze Panes", cmd: "freezePanes" }, { label: "Freeze Top Row", cmd: "freezeTop" }, { label: "Freeze First Column", cmd: "freezeFirst" }],
    sheetView: [{ label: "Default", cmd: "sheetViewDefault" }, { label: "Custom Views…", cmd: "customViews" }],
    access: [{ label: "Check Accessibility", cmd: "accessibilityCheck" }],
    editingMenu: [{ label: "Editing", cmd: "editingMode" }, { label: "Viewing", cmd: "viewingMode" }, { label: "Reviewing", cmd: "reviewingMode" }],
    fnRecent: FUNCS.filter((f) => ["SUM", "AVERAGE", "IF"].includes(f[0]))
      .map((f) => ({ label: f[0], cmd: "fnInsert", val: f[0] })),
    fnFinancial: fnItems("Financial"),
    fnLogical: fnItems("Logical"),
    fnText: fnItems("Text"),
    fnDate: fnItems("Date & Time"),
    fnLookup: fnItems("Lookup & Reference"),
    fnMath: fnItems("Math & Trig"),
    fnMore: fnItems("Statistical"),
    search: []
  };

  function closeFloating() {
    $("popRoot").innerHTML = "";
    $("appMenu").classList.add("hidden");
    $("profileMenu").classList.add("hidden");
  }

  function showPop(anchor, items) {
    closeFloating();
    const root = $("popRoot");
    const body = items.map((it) => {
      if (it.sep) return `<div class="msep"></div>`;
      if (it.disabled) return `<div class="mi dis">${esc(it.label)}</div>`;
      return `<button class="mi" ${it.cmd ? `data-cmd="${esc(it.cmd)}"` : ""} ` +
        `${it.val !== undefined ? `data-val="${esc(it.val)}"` : ""} ${it.menu ? `data-menu="${esc(it.menu)}"` : ""}>` +
        `${esc(it.label)}${it.hint ? `<kbd>${esc(it.hint)}</kbd>` : ""}</button>`;
    }).join("");
    root.innerHTML = `<div class="menu" role="menu">${body}</div>`;
    const r = anchor.getBoundingClientRect();
    const menu = root.firstElementChild;
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 280)) + "px";
    menu.style.top = Math.min(r.bottom + 4, window.innerHeight - 40) + "px";
  }

  function openNamedMenu(name, anchor) {
    const items = MENUS[name];
    if (!items || !items.length) return core.toast("Coming soon: " + name);
    showPop(anchor, items);
  }

  // ---------- Dialogs ----------
  function dialog(title, bodyHtml, buttons) {
    closeFloating();
    const root = $("dialogRoot");
    const list = buttons || [];
    root.innerHTML =
      `<div class="dlg-back"></div>` +
      `<div class="dlg" role="dialog" aria-modal="true" aria-label="${esc(title)}">` +
      `<div class="dlg-h"><span>${esc(title)}</span><button class="dlg-x" aria-label="Close">&times;</button></div>` +
      `<div class="dlg-b">${bodyHtml}</div>` +
      `<div class="dlg-f">${list.map((b, i) => `<button class="btn${b.primary ? " primary" : ""}" data-i="${i}">${esc(b.label)}</button>`).join("")}</div>` +
      `</div>`;
    const dlgEl = root.querySelector(".dlg");
    const onKey = (e) => { if (e.key === "Escape") close(); };
    function close() {
      root.innerHTML = "";
      document.removeEventListener("keydown", onKey);
    }
    document.addEventListener("keydown", onKey);
    root.querySelector(".dlg-back").onclick = close;
    root.querySelector(".dlg-x").onclick = close;
    root.querySelectorAll(".dlg-f .btn").forEach((btn) => {
      btn.onclick = () => {
        const b = list[+btn.dataset.i];
        if (b.onClick && b.onClick(dlgEl) === false) return;
        close();
      };
    });
    return { el: dlgEl, close };
  }

  const table = (rows) => `<table class="kv">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;

  function showStats() {
    let filled = 0, nums = 0, texts = 0, formulas = 0, errors = 0, sum = 0, maxR = -1, maxC = -1;
    const E = engine();
    for (const [k, cell] of core.cells) {
      const [r, c] = k.split(",").map(Number);
      const v = core.cellValue(r, c);
      if (v === null) continue;
      filled++;
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
      if (cell.v[0] === "=") formulas++;
      if (typeof v === "number") { nums++; sum += v; }
      else if (typeof v === "string") texts++;
      if (E.isError(v)) errors++;
    }
    const used = filled ? `A1:${engine().indexToCol(maxC)}${maxR + 1}` : "(empty)";
    dialog("Workbook Statistics", table([
      ["Worksheets", "1"], ["Used range", used], ["Filled cells", String(filled)], ["Numbers", String(nums)],
      ["Text cells", String(texts)], ["Formulas", String(formulas)], ["Errors", String(errors)],
      ["Sum of numbers", String(Number(sum.toPrecision(12)))]
    ]), [{ label: "Close", primary: true }]);
  }

  function showList(title, rows) {
    dialog(title, `<table class="list">${rows.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join("")}</table>`,
      [{ label: "Close", primary: true }]);
  }

  function showShortcuts() {
    showList("Keyboard Shortcuts", [
      ["Ctrl+C / Ctrl+X / Ctrl+V", "Copy, cut, paste"], ["Ctrl+Z / Ctrl+Y", "Undo, redo"],
      ["Ctrl+B / Ctrl+I / Ctrl+U", "Bold, italic, underline"], ["Ctrl+D", "Fill down"],
      ["Ctrl+F", "Find"], ["Ctrl+S", "Download a copy of the workbook"], ["Ctrl+A", "Select all"],
      ["F2", "Edit the active cell"], ["Enter / Tab", "Move to the next cell"], ["Delete", "Clear values"],
      ["Alt+Q", "Focus the command search"]
    ]);
  }

  function showFunctionList() {
    showList("Function List", FUNCS.map((f) => [f[0], f[2]]));
  }

  function showHelp() {
    dialog("Help", `<p>Quadra Office works like a spreadsheet. Type in a cell, or pick a command from the ribbon.</p>
      <p>Formulas start with <b>=</b>, for example <code>=SUM(A1:A10)</code>. Use the Formulas tab to browse functions.</p>
      <p>Your workbook is saved automatically in this browser.</p>`, [{ label: "Close", primary: true }]);
  }

  function showWhatsNew() {
    dialog("What's New", `<ul><li>Ribbon redesigned with separate tabs.</li><li>Dark mode switch in the title bar.</li>
      <li>Undo and redo, drawing tools and simple charts.</li><li>Automatic saving in this browser.</li></ul>`,
      [{ label: "Close", primary: true }]);
  }

  function showFeedback() {
    dialog("Feedback", `<p>Thank you. This local copy does not send feedback anywhere yet.</p>`, [{ label: "Close", primary: true }]);
  }

  function showShare() {
    const url = location.href.split("#")[0];
    const d = dialog("Share", `<p>Anyone who opens this link on this device can see the workbook.</p>
      <div class="copy-row"><input id="shareUrl" readonly value="${esc(url)}" /><button class="btn primary" id="shareCopy">Copy</button></div>`,
      [{ label: "Close", primary: true }]);
    d.el.querySelector("#shareCopy").onclick = () => copyText(url, "Link copied");
  }

  // Function picker from the fx button and the Insert Function command
  function showInsertFunction() {
    const d = dialog("Insert Function",
      `<input class="search-in" id="fnSearch" placeholder="Search for a function" />
       <div class="fn-list" id="fnList"></div>`,
      [{ label: "Cancel" }]);
    const list = d.el.querySelector("#fnList");
    const draw = (q) => {
      const needle = q.trim().toUpperCase();
      list.innerHTML = FUNCS.filter((f) => !needle || f[0].includes(needle))
        .map((f) => `<button class="fn-item" data-fn="${esc(f[0])}"><b>${esc(f[0])}</b><span>${esc(f[2])}</span></button>`).join("")
        || `<div class="mi dis">No matching function</div>`;
    };
    draw("");
    d.el.querySelector("#fnSearch").addEventListener("input", (e) => draw(e.target.value));
    d.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-fn]");
      if (!b) return;
      d.close();
      insertFunction(b.dataset.fn);
    });
  }

  function insertFunction(name) {
    if (core.isProtected()) return core.toast("Sheet is protected. Unprotect it to edit.");
    core.openEditor("=" + name + "(");
  }

  // ---------- Charts (previewed in a dialog) ----------
  const PALETTE = ["#107c41", "#2b88d8", "#f7630c", "#8764b8", "#e3008c", "#00b7c3"];

  function chartData() {
    const R = core.range();
    const rows = Math.min(R.r2 - R.r1 + 1, 200);
    const cols = [];
    for (let c = R.c1; c <= R.c2; c++) cols.push(c);
    const isNumCol = (c) => {
      for (let r = R.r1; r < R.r1 + rows; r++) if (typeof core.cellValue(r, c) === "number") return true;
      return false;
    };
    const numCols = cols.filter(isNumCol);
    if (!numCols.length) return null;
    const labelCol = cols.find((c) => !numCols.includes(c));
    const seriesCols = numCols.filter((c) => c !== labelCol).slice(0, 6);
    const labels = [];
    for (let r = R.r1; r < R.r1 + rows; r++) {
      labels.push(labelCol === undefined ? String(r - R.r1 + 1) : core.displayText(core.cellValue(r, labelCol), {}));
    }
    const series = seriesCols.map((c) => ({
      name: engine().indexToCol(c),
      values: Array.from({ length: rows }, (_, i) => {
        const v = core.cellValue(R.r1 + i, c);
        return typeof v === "number" ? v : 0;
      })
    }));
    return { labels, series };
  }

  const fmtN = (n) => Number(n.toPrecision(4)).toString();

  function axesSvg(W, H, pad) {
    return `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="currentColor"/>` +
      `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H - pad}" stroke="currentColor"/>`;
  }

  function histogramSvg(data) {
    const vals = data.series.length ? data.series[0].values : [];
    if (!vals.length) return `<p class="note">Select a column of numbers.</p>`;
    const bins = 5, lo = Math.min(...vals), hi = Math.max(...vals), w = (hi - lo) / bins || 1;
    const counts = new Array(bins).fill(0);
    for (const v of vals) counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++;
    const labels = counts.map((_, i) => `${fmtN(lo + i * w)}–${fmtN(lo + (i + 1) * w)}`);
    return chartSvg("column", { labels, series: [{ name: "Count", values: counts }] });
  }

  function scatterSvg(data) {
    const W = 640, H = 340, pad = 46;
    if (!data.series.length) return `<p class="note">Select at least one column of numbers.</p>`;
    const ys = data.series.length > 1 ? data.series[1].values : data.series[0].values;
    const xs = data.series.length > 1 ? data.series[0].values : ys.map((_, i) => i + 1);
    const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(0, ...ys), ymax = Math.max(...ys);
    const X = (v) => pad + ((v - xmin) / (xmax - xmin || 1)) * (W - 2 * pad);
    const Y = (v) => H - pad - ((v - ymin) / (ymax - ymin || 1)) * (H - 2 * pad);
    let body = axesSvg(W, H, pad);
    xs.forEach((x, i) => { body += `<circle cx="${X(x)}" cy="${Y(ys[i])}" r="4" fill="${PALETTE[0]}"/>`; });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart">${body}</svg>`;
  }

  // Columns for the first series, lines for the others, on one shared scale
  function comboSvg(data) {
    const W = 640, H = 340, pad = 46, n = data.labels.length;
    const all = data.series.flatMap((s) => s.values);
    const max = Math.max(0, ...all) || 1, min = Math.min(0, ...all), span = max - min || 1;
    const yOf = (v) => H - pad - ((v - min) / span) * (H - 2 * pad);
    const groupW = (W - 2 * pad) / Math.max(n, 1), zero = yOf(0);
    let body = axesSvg(W, H, pad);
    data.series[0].values.forEach((v, i) => {
      const x = pad + groupW * i + groupW * 0.2;
      body += `<rect x="${x}" y="${Math.min(yOf(v), zero)}" width="${groupW * 0.6}" height="${Math.abs(zero - yOf(v))}" fill="${PALETTE[0]}"/>`;
    });
    data.series.slice(1).forEach((s, si) => {
      const pts = s.values.map((v, i) => `${pad + groupW * (i + 0.5)},${yOf(v)}`).join(" ");
      body += `<polyline fill="none" stroke="${PALETTE[(si + 1) % 6]}" stroke-width="2.5" points="${pts}"/>`;
    });
    data.labels.forEach((l, i) => {
      body += `<text x="${pad + groupW * (i + 0.5)}" y="${H - pad + 16}" font-size="11" text-anchor="middle">${esc(l.slice(0, 8))}</text>`;
    });
    const legend = data.series.map((s, si) =>
      `<rect x="${pad + si * 110}" y="8" width="11" height="11" fill="${PALETTE[si % 6]}"/>` +
      `<text x="${pad + si * 110 + 16}" y="18" font-size="12">${si ? "Line" : "Column"} ${esc(s.name)}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="chart">${body}${legend}</svg>`;
  }

  function chartSvg(type, data) {
    if (type === "histogram") return histogramSvg(data);
    if (type === "scatter") return scatterSvg(data);
    if (type === "combo") return comboSvg(data);
    const W = 640, H = 340, pad = 46;
    const n = data.labels.length;
    if (type === "pie") {
      const vals = data.series[0].values.map((v) => Math.max(0, v));
      const total = vals.reduce((a, b) => a + b, 0);
      if (!total) return `<p class="note">Pie charts need positive numbers.</p>`;
      let a0 = -Math.PI / 2, parts = "", legend = "";
      const cx = 170, cy = 170, rr = 140;
      vals.forEach((v, i) => {
        if (!v) return;
        const a1 = a0 + (v / total) * Math.PI * 2;
        const large = v / total > 0.5 ? 1 : 0;
        const x0 = cx + rr * Math.cos(a0), y0 = cy + rr * Math.sin(a0);
        const x1 = cx + rr * Math.cos(a1), y1 = cy + rr * Math.sin(a1);
        parts += `<path d="M${cx},${cy} L${x0},${y0} A${rr},${rr} 0 ${large} 1 ${x1},${y1} Z" fill="${PALETTE[i % 6]}"/>`;
        legend += `<rect x="360" y="${30 + i * 22}" width="12" height="12" fill="${PALETTE[i % 6]}"/>` +
          `<text x="380" y="${41 + i * 22}" font-size="13">${esc(data.labels[i])}: ${Number((v / total * 100).toFixed(1))}%</text>`;
        a0 = a1;
      });
      return `<svg viewBox="0 0 ${W} ${H}" class="chart">${parts}${legend}</svg>`;
    }

    const all = data.series.flatMap((s) => s.values);
    const max = Math.max(0, ...all) || 1;
    const min = Math.min(0, ...all);
    const span = max - min || 1;
    const yOf = (v) => H - pad - ((v - min) / span) * (H - 2 * pad);
    const plotW = W - 2 * pad;
    const groupW = plotW / Math.max(n, 1);
    let body = `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="currentColor"/>` +
      `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H - pad}" stroke="currentColor"/>`;

    if (type === "line") {
      data.series.forEach((s, si) => {
        const pts = s.values.map((v, i) => `${pad + groupW * (i + 0.5)},${yOf(v)}`).join(" ");
        body += `<polyline fill="none" stroke="${PALETTE[si % 6]}" stroke-width="2.5" points="${pts}"/>`;
      });
      data.labels.forEach((l, i) => {
        body += `<text x="${pad + groupW * (i + 0.5)}" y="${H - pad + 16}" font-size="11" text-anchor="middle">${esc(l.slice(0, 8))}</text>`;
      });
    } else if (type === "bar") {
      const groupH = (H - 2 * pad) / Math.max(n, 1);
      const bh = (groupH * 0.7) / data.series.length;
      data.series.forEach((s, si) => {
        s.values.forEach((v, i) => {
          const w = ((v - min) / span) * plotW;
          const y = pad + groupH * i + groupH * 0.15 + si * bh;
          body += `<rect x="${pad}" y="${y}" width="${Math.max(0, w)}" height="${bh}" fill="${PALETTE[si % 6]}"/>`;
        });
      });
      data.labels.forEach((l, i) => {
        body += `<text x="${pad - 6}" y="${pad + groupH * (i + 0.5)}" font-size="11" text-anchor="end" dominant-baseline="middle">${esc(l.slice(0, 8))}</text>`;
      });
    } else {
      const bw = (groupW * 0.7) / data.series.length;
      const zero = yOf(0);
      data.series.forEach((s, si) => {
        s.values.forEach((v, i) => {
          const x = pad + groupW * i + groupW * 0.15 + si * bw;
          const y = yOf(v);
          body += `<rect x="${x}" y="${Math.min(y, zero)}" width="${bw}" height="${Math.abs(zero - y)}" fill="${PALETTE[si % 6]}"/>`;
        });
      });
      data.labels.forEach((l, i) => {
        body += `<text x="${pad + groupW * (i + 0.5)}" y="${H - pad + 16}" font-size="11" text-anchor="middle">${esc(l.slice(0, 8))}</text>`;
      });
    }
    const legend = data.series.map((s, si) =>
      `<rect x="${pad + si * 90}" y="8" width="11" height="11" fill="${PALETTE[si % 6]}"/>` +
      `<text x="${pad + si * 90 + 16}" y="18" font-size="12">Column ${esc(s.name)}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="chart">${body}${legend}</svg>`;
  }

  function showChart(type) {
    const data = chartData();
    if (!data) return core.toast("Select cells that contain numbers to chart");
    const svg = chartSvg(type, data);
    const d = dialog("Chart preview",
      `<div class="chart-box">${svg}</div>
       <p class="note">The chart is previewed here. It is not placed in the sheet yet.</p>`,
      [{ label: "Download SVG", onClick: () => { download(safeFileName(docName(), ".svg"), svg, "image/svg+xml"); return false; } },
        { label: "Close", primary: true }]);
    return d;
  }

  // ---------- Insert: PivotTable, checkbox, text box, shapes, pictures ----------
  function showPivot() {
    const R = core.range();
    if (R.r2 === R.r1) return core.toast("Select a table with a header row first");
    const cols = [];
    for (let c = R.c1; c <= R.c2; c++) cols.push(c);
    const headerOf = (c) => core.displayText(core.cellValue(R.r1, c), {}) || engine().indexToCol(c);
    const numCols = cols.filter((c) => {
      for (let r = R.r1 + 1; r <= R.r2; r++) if (typeof core.cellValue(r, c) === "number") return true;
      return false;
    });
    if (!numCols.length) return core.toast("The selection needs a column of numbers to add up");
    dialog("PivotTable",
      `<label class="fmt-line">Group rows by
         <select id="pvGroup">${cols.map((c) => `<option value="${c}">${esc(headerOf(c))}</option>`).join("")}</select></label>
       <p><b>Add up</b></p>
       ${numCols.map((c) => `<label class="radio"><input type="checkbox" data-col="${c}" checked /> ${esc(headerOf(c))}</label>`).join("")}
       <p class="note">The summary is written two columns to the right of the selection. The totals row is a formula.</p>`,
      [{ label: "Cancel" },
        { label: "OK", primary: true, onClick: (el) => {
          const g = Number(el.querySelector("#pvGroup").value);
          const vals = [...el.querySelectorAll("input[data-col]:checked")].map((i) => Number(i.dataset.col));
          if (!vals.length) { core.toast("Pick at least one column to add up"); return false; }
          buildPivot(R, g, vals, headerOf);
        } }]);
  }

  function buildPivot(R, g, vals, headerOf) {
    if (core.isProtected()) return core.toast("Sheet is protected. Unprotect it to edit.");
    const groups = new Map();
    for (let r = R.r1 + 1; r <= R.r2; r++) {
      const k = core.displayText(core.cellValue(r, g), {}) || "(blank)";
      if (!groups.has(k)) groups.set(k, vals.map(() => 0));
      const acc = groups.get(k);
      vals.forEach((c, i) => { const v = core.cellValue(r, c); if (typeof v === "number") acc[i] += v; });
    }
    const top = R.r1, left = R.c2 + 2;
    const put = (r, c, v, bold) => {
      core.setValue(r, c, v);
      if (bold) core.getOrCreate(r, c).s.bold = true;
    };
    put(top, left, headerOf(g), true);
    vals.forEach((c, i) => put(top, left + 1 + i, "Sum of " + headerOf(c), true));
    let r = top + 1;
    for (const [k, acc] of groups) {
      put(r, left, k);
      acc.forEach((x, i) => put(r, left + 1 + i, String(Number(x.toPrecision(12)))));
      r++;
    }
    put(r, left, "Total", true);
    vals.forEach((c, i) => {
      const col = engine().indexToCol(left + 1 + i);
      put(r, left + 1 + i, `=SUM(${col}${top + 2}:${col}${r})`, true);
    });
    core.refresh();
    core.toast(`PivotTable created at ${engine().indexToCol(left)}${top + 1}`);
  }

  function insertCheckbox() {
    if (core.isProtected()) return core.toast("Sheet is protected. Unprotect it to edit.");
    const c = core.getOrCreate(core.sel.ar, core.sel.ac);
    if (c.v === "") c.v = "FALSE";
    c.s.checkbox = true;
    core.refresh();
    core.toast("Checkbox inserted. Click its box to tick it.");
  }

  // Floating objects (text boxes, shapes, pictures). They live on the drawing layer, scroll with the sheet,
  // and are kept for this session only (they are not part of the saved workbook yet).
  const objects = [];
  function placeObject(o) {
    const sel = core.sel;
    objects.push({ ...o, x: HDR_W + sel.ac * COL_W + 24, y: HDR_H + sel.ar * ROW_H + 24 });
    redrawInk();
  }

  function drawObjects(ctx, sx, sy, W, H) {
    const pal = core.pal;
    ctx.save();
    ctx.beginPath(); ctx.rect(HDR_W, HDR_H, W - HDR_W, H - HDR_H); ctx.clip();
    for (const o of objects) {
      const x = o.x - sx, y = o.y - sy;
      if (x > W || y > H || x + o.w < HDR_W || y + o.h < HDR_H) continue;
      ctx.save();
      if (o.rot) {
        ctx.translate(x + o.w / 2, y + o.h / 2);
        ctx.rotate(o.rot * Math.PI / 180);
        ctx.translate(-(x + o.w / 2), -(y + o.h / 2));
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = pal.accent;
      if (o.kind === "rect") {
        ctx.strokeRect(x, y, o.w, o.h);
      } else if (o.kind === "oval") {
        ctx.beginPath(); ctx.ellipse(x + o.w / 2, y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (o.kind === "arrow") {
        const x2 = x + o.w, y2 = y + o.h / 2;
        ctx.beginPath();
        ctx.moveTo(x, y2); ctx.lineTo(x2, y2);
        ctx.moveTo(x2, y2); ctx.lineTo(x2 - 12, y2 - 7);
        ctx.moveTo(x2, y2); ctx.lineTo(x2 - 12, y2 + 7);
        ctx.stroke();
      } else if (o.kind === "text") {
        ctx.fillStyle = pal.cell; ctx.fillRect(x, y, o.w, o.h); ctx.strokeRect(x, y, o.w, o.h);
        ctx.fillStyle = pal.text; ctx.font = "14px Calibri, Arial, sans-serif"; ctx.textBaseline = "top";
        ctx.fillText(o.text, x + 6, y + 6, o.w - 12);
      } else if (o.kind === "picture") {
        if (o.img.complete && o.img.naturalWidth) ctx.drawImage(o.img, x, y, o.w, o.h);
        else ctx.strokeRect(x, y, o.w, o.h);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function insertTextBox() {
    const text = prompt("Text for the text box:", "Text");
    if (text === null) return;
    placeObject({ kind: "text", text: text.slice(0, 200), w: 220, h: 64 });
  }

  function insertShape(kind) {
    const size = kind === "arrow" ? { w: 160, h: 24 } : { w: 150, h: 96 };
    placeObject({ kind, ...size });
  }

  function insertPicture() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 320 / img.naturalWidth, 240 / img.naturalHeight);
          placeObject({ kind: "picture", img, w: img.naturalWidth * scale, h: img.naturalHeight * scale });
          core.toast("Picture inserted");
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  // ---------- Workbook files ----------
  function toCsv() {
    const texts = new Map();
    let maxR = -1, maxC = -1;
    for (const k of core.cells.keys()) {
      const [r, c] = k.split(",").map(Number);
      const v = core.cellValue(r, c);
      if (v === null) continue;
      texts.set(k, core.displayText(v, (core.getCell(r, c) || { s: {} }).s));
      maxR = Math.max(maxR, r);
      maxC = Math.max(maxC, c);
    }
    const lines = [];
    for (let r = 0; r <= maxR; r++) {
      const row = [];
      for (let c = 0; c <= maxC; c++) {
        const t = texts.get(r + "," + c) || "";
        row.push(/[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
      }
      lines.push(row.join(","));
    }
    return lines.join("\r\n");
  }

  function saveBook() {
    download(safeFileName(docName(), ".quadra.json"), core.serialize(), "application/json");
    core.toast("Downloaded a copy of the workbook");
  }

  function exportCsv() {
    download(safeFileName(docName(), ".csv"), toCsv(), "text/csv");
    core.toast("Exported as CSV");
  }

  function renameBook() {
    const name = prompt("Name of the workbook:", docName());
    if (name === null) return;
    setDocName(name.trim() || "Book 1");
  }

  function setDocName(name) {
    $("docName").textContent = name;
    localStorage.setItem(NAME_KEY, name);
  }

  function loadBookFromText(text, name) {
    const arr = JSON.parse(text);
    const valid = Array.isArray(arr) && arr.every((e) => Array.isArray(e) && typeof e[0] === "string" && e[1] && typeof e[1].v === "string");
    if (!valid) throw new Error("not a workbook");
    core.load(text);
    if (name) setDocName(name);
  }

  // ---------- Backstage (File tab) ----------
  const BS_ITEMS = [
    ["new", "New", "newFile"], ["open", "Open", "open"], ["save", "Save", "save"],
    ["saveas", "Save As", "export"], ["csv", "Export as CSV", "export"], ["print", "Print", "print"],
    ["share", "Share", "share"], ["rename", "Rename", "rename"], ["history", "Version History", "version"],
    ["info", "Info", "info"], ["options", "Options", "options"]
  ];

  function openBackstage(panel) {
    closeFloating();
    const bs = $("backstage");
    bs.innerHTML =
      `<div class="bs-side"><button class="bs-back" data-bs-back>${ic("chevUp")}<span>Back</span></button>` +
      BS_ITEMS.map(([k, label, icon]) => `<button class="bs-item" data-bs="${k}">${ic(icon)}<span>${esc(label)}</span></button>`).join("") +
      `</div><div class="bs-main" id="bsMain"></div>`;
    bs.classList.remove("hidden");
    showBsPanel(panel || "info");
  }

  function closeBackstage() {
    $("backstage").classList.add("hidden");
    $("backstage").innerHTML = "";
  }

  function showBsPanel(key) {
    const main = $("bsMain");
    document.querySelectorAll("#backstage .bs-item").forEach((b) => b.classList.toggle("active", b.dataset.bs === key));
    if (key === "new") {
      main.innerHTML = `<h2>New</h2>
        <div class="bs-card"><b>Blank workbook</b><p>Start with an empty sheet.</p>
        <button class="btn primary" id="bsNewGo">Create blank workbook</button></div>
        <p class="note">This clears the current sheet. Use Undo afterwards if needed.</p>`;
      main.querySelector("#bsNewGo").onclick = () => {
        if (!confirm("Clear this workbook and start a blank one?")) return;
        core.clearSheet();
        setDocName("Book 1");
        closeBackstage();
        core.toast("New blank workbook");
      };
    } else if (key === "open") {
      main.innerHTML = `<h2>Open</h2>
        <div class="bs-card"><b>Open a saved workbook</b><p>Choose a file saved with Save (.quadra.json).</p>
        <input type="file" id="bsFile" accept=".json,application/json" /></div>`;
      main.querySelector("#bsFile").onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            loadBookFromText(String(reader.result), file.name.replace(/\.quadra\.json$|\.json$/i, ""));
            closeBackstage();
            core.toast("Workbook opened");
          } catch (err) {
            core.toast("That file is not a Quadra workbook");
          }
        };
        reader.readAsText(file);
      };
    } else if (key === "save") {
      main.innerHTML = `<h2>Save</h2>
        <div class="bs-card"><b>Changes are saved automatically</b><p>Your workbook is kept in this browser. Download a copy to keep it elsewhere.</p>
        <button class="btn primary" id="bsSave">Download copy (.quadra.json)</button></div>`;
      main.querySelector("#bsSave").onclick = saveBook;
    } else if (key === "saveas" || key === "csv") {
      main.innerHTML = `<h2>Export as CSV</h2>
        <div class="bs-card"><b>Comma separated values</b><p>Exports the shown values of the used range.</p>
        <button class="btn primary" id="bsCsv">Export CSV</button></div>`;
      main.querySelector("#bsCsv").onclick = exportCsv;
    } else if (key === "print") {
      main.innerHTML = `<h2>Print</h2><div class="bs-card"><button class="btn primary" id="bsPrint">Print</button></div>`;
      main.querySelector("#bsPrint").onclick = () => showPrintPreview();
    } else if (key === "share") {
      main.innerHTML = `<h2>Share</h2><div class="bs-card"><button class="btn primary" id="bsShare">Get a link</button></div>`;
      main.querySelector("#bsShare").onclick = () => { closeBackstage(); showShare(); };
    } else if (key === "rename") {
      main.innerHTML = `<h2>Rename</h2>
        <div class="bs-card"><input id="bsName" value="${esc(docName())}" /><button class="btn primary" id="bsRename">Save name</button></div>`;
      main.querySelector("#bsRename").onclick = () => {
        setDocName(main.querySelector("#bsName").value.trim() || "Book 1");
        core.toast("Renamed");
      };
    } else if (key === "history") {
      main.innerHTML = `<h2>Version History</h2><div class="bs-card"><p>Version history is not available in this version.</p></div>`;
    } else if (key === "options") {
      const dark = document.documentElement.dataset.theme === "dark";
      main.innerHTML = `<h2>Options</h2>
        <div class="bs-card"><b>Appearance</b>
          <label class="radio"><input type="radio" name="theme" value="light" ${dark ? "" : "checked"}/> Light</label>
          <label class="radio"><input type="radio" name="theme" value="dark" ${dark ? "checked" : ""}/> Dark</label></div>`;
      main.querySelectorAll('input[name="theme"]').forEach((r) => r.onchange = () => applyTheme(r.value));
    } else {
      const s = statsTable();
      main.innerHTML = `<h2>Info</h2><div class="bs-card">${s}</div>`;
    }
  }

  function statsTable() {
    let filled = 0;
    for (const k of core.cells.keys()) {
      const [r, c] = k.split(",").map(Number);
      if (core.cellValue(r, c) !== null) filled++;
    }
    return table([["Workbook", docName()], ["Filled cells", String(filled)], ["Storage", "This browser (automatic)"]]);
  }

  // ---------- Theme ----------
  function applyTheme(name) {
    const t = THEMES[name] ? name : "light";
    document.documentElement.dataset.theme = t;
    core.setPalette(Object.assign({}, THEMES[t], accentOverride ? { accent: accentOverride } : {}));
    const sw = $("themeSwitch");
    const dark = t === "dark";
    sw.setAttribute("aria-checked", String(dark));
    sw.title = dark ? "Switch to light mode" : "Switch to dark mode";
    sw.querySelector(".ts-knob").innerHTML = ic(dark ? "moon" : "sun");
    localStorage.setItem(THEME_KEY, t);
  }

  function toggleTheme() {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  }

  // ---------- Title-bar flyouts ----------
  function renderAppMenu() {
    $("appMenu").innerHTML =
      `<div class="app-grid-h">Quadra apps</div>` +
      `<div class="app-grid-b">${APPS.map((a) =>
        `<button class="app-tile${a.current ? " current" : ""}" data-app="${esc(a.name)}">${ic(a.icon, "ic app-ic")}<span>${esc(a.name)}</span></button>`
      ).join("")}</div>`;
  }

  function launchApp(name) {
    const app = APPS.find((a) => a.name === name);
    closeFloating();
    if (!app || app.current) return;
    if (!app.url) return core.toast(`${name} is not set up in this copy`);
    location.href = app.url;
  }

  function renderProfileMenu() {
    const dark = document.documentElement.dataset.theme === "dark";
    $("profileMenu").innerHTML =
      `<div class="pm-head"><div class="avatar big">QO</div><div><div class="pm-name">Quadra User</div><div class="pm-sub">Local profile</div></div></div>` +
      `<button class="mi" data-profile="theme">${ic(dark ? "sun" : "moon")}<span>${dark ? "Light mode" : "Dark mode"}</span></button>` +
      `<button class="mi" data-profile="options">${ic("options")}<span>Options</span></button>` +
      `<button class="mi" data-profile="account">${ic("profile")}<span>Account</span></button>` +
      `<button class="mi" data-profile="signout">${ic("file")}<span>Sign out</span></button>`;
  }

  function profileAction(key) {
    if (key === "theme") toggleTheme();
    else if (key === "options") openBackstage("options");
    else core.toast("Accounts are not available in this local version");
  }

  // ---------- Search (command finder) ----------
  function allCommands() {
    const out = [];
    const walk = (items, tab) => {
      for (const x of items) {
        if (x.items) walk(x.items, tab);
        else if ((x.kind === "bg" || x.kind === "sm") && x.label && !x.disabled) {
          out.push({ label: x.label, cmd: x.cmd, val: x.val, menu: x.menu, hint: tab });
        }
      }
    };
    for (const [tab, groups] of Object.entries(TABS)) for (const g of groups) walk(g.items, tab);
    return out;
  }

  function runSearch(q) {
    const needle = q.trim().toLowerCase();
    if (!needle) return closeFloating();
    const hits = allCommands().filter((c) => c.label.toLowerCase().includes(needle)).slice(0, 12);
    if (!hits.length) return showPop($("searchBox"), [{ label: "No commands match \"" + q + "\"", disabled: true }]);
    showPop($("searchBox"), hits.map((h) => ({ label: h.label, cmd: h.cmd, val: h.val, menu: h.menu, hint: h.hint })));
  }

  // ---------- Status bar: selection statistics ----------
  function updateStatus() {
    const el = $("selStats");
    const rects = [core.range(), ...core.getExtras()];
    let area = 0;
    for (const R of rects) area += (R.r2 - R.r1 + 1) * (R.c2 - R.c1 + 1);
    if (area < 2 || area > 20000) { el.textContent = ""; return; }
    let count = 0, nums = 0, sum = 0;
    for (const R of rects) {
      for (let r = R.r1; r <= R.r2; r++) {
        for (let c = R.c1; c <= R.c2; c++) {
          const v = core.cellValue(r, c);
          if (v === null) continue;
          count++;
          if (typeof v === "number") { nums++; sum += v; }
        }
      }
    }
    const fmt = (n) => Number(n.toPrecision(10)).toLocaleString("en-US", { maximumFractionDigits: 4 });
    el.textContent = nums
      ? `Sum: ${fmt(sum)}    Average: ${fmt(sum / nums)}    Count: ${count}`
      : `Count: ${count}`;
  }

  // ---------- Autosave ----------
  let saveTimer = 0, lastSaved = null;

  function setSaved(text) {
    $("savedState").querySelector("span").textContent = text;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const json = core.serialize();
      if (json === lastSaved) return setSaved("Saved");
      try {
        localStorage.setItem(AUTOSAVE_KEY, json);
        lastSaved = json;
        setSaved("Saved");
      } catch (e) {
        console.error(e);
        setSaved("Not saved");
      }
    }, 400);
  }

  function restoreSession() {
    const name = localStorage.getItem(NAME_KEY);
    if (name) $("docName").textContent = name;
    const json = localStorage.getItem(AUTOSAVE_KEY);
    if (!json) return;
    try {
      core.load(json);
      lastSaved = json;
    } catch (e) {
      console.error(e);
      localStorage.removeItem(AUTOSAVE_KEY);
    }
  }

  // ---------- Drawing layer (Draw tab) ----------
  const draw = { mode: "pointer", strokes: [], cur: null, layer: null, ctx: null, dpr: 1 };
  const DRAW_STYLE = {
    pen: { color: "#201f1e", width: 2, alpha: 1 },
    penRed: { color: "#d13438", width: 2, alpha: 1 },
    highlighter: { color: "#ffd83d", width: 14, alpha: 0.45 }
  };

  function sizeDrawLayer() {
    const stage = draw.layer.parentElement;
    draw.dpr = window.devicePixelRatio || 1;
    draw.layer.style.width = stage.clientWidth + "px";
    draw.layer.style.height = stage.clientHeight + "px";
    draw.layer.width = stage.clientWidth * draw.dpr;
    draw.layer.height = stage.clientHeight * draw.dpr;
    draw.ctx.setTransform(draw.dpr, 0, 0, draw.dpr, 0, 0);
    redrawInk();
  }

  function redrawInk() {
    const ctx = draw.ctx;
    ctx.clearRect(0, 0, draw.layer.width, draw.layer.height);
    for (const s of draw.strokes) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.globalAlpha = s.alpha;
      ctx.beginPath();
      s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (s.pts.length === 1) ctx.lineTo(s.pts[0].x + 0.01, s.pts[0].y);
      ctx.stroke();
      ctx.restore();
    }
    drawObjects(ctx, wrap.scrollLeft, wrap.scrollTop, draw.layer.clientWidth, draw.layer.clientHeight);
  }

  function setDrawMode(mode) {
    draw.mode = mode;
    const on = mode !== "pointer";
    draw.layer.classList.toggle("active", on);
    document.querySelectorAll('[data-cmd="draw"]').forEach((b) => b.classList.toggle("on", b.dataset.val === mode));
    core.toast(on ? (mode === "eraser" ? "Eraser: drag over ink to remove it" : "Draw on the sheet. Choose Pointer to stop.") : "Pointer");
  }

  function localPoint(e) {
    const r = draw.layer.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function eraseAt(p) {
    draw.strokes = draw.strokes.filter((s) => !s.pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 12));
    const sx = wrap.scrollLeft, sy = wrap.scrollTop;
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      const x = o.x - sx, y = o.y - sy;
      if (p.x >= x && p.x <= x + o.w && p.y >= y && p.y <= y + o.h) objects.splice(i, 1);
    }
    redrawInk();
  }

  function setupDrawing() {
    draw.layer = $("drawLayer");
    draw.ctx = draw.layer.getContext("2d");
    draw.layer.addEventListener("pointerdown", (e) => {
      if (draw.mode === "pointer") return;
      e.preventDefault();
      draw.layer.setPointerCapture(e.pointerId);
      const p = localPoint(e);
      if (draw.mode === "eraser") {
        draw.cur = "erase";
        eraseAt(p);
      } else {
        const style = DRAW_STYLE[draw.mode] || DRAW_STYLE.pen;
        draw.cur = { ...style, pts: [p] };
        draw.strokes.push(draw.cur);
      }
      redrawInk();
    });
    draw.layer.addEventListener("pointermove", (e) => {
      if (!draw.cur) return;
      const p = localPoint(e);
      if (draw.cur === "erase") eraseAt(p);
      else draw.cur.pts.push(p);
      redrawInk();
    });
    const end = () => { draw.cur = null; };
    draw.layer.addEventListener("pointerup", end);
    draw.layer.addEventListener("pointercancel", end);
    sizeDrawLayer();
    window.addEventListener("resize", sizeDrawLayer);
  }

  // ---------- Command routing ----------
  // Conditional formatting: asks for the values and adds a light-red highlight rule
  const RULE_STYLE = { fill: "#ffc7ce", color: "#9c0006" };
  function addRuleFromPrompt(op) {
    const labels = {
      gt: "Format cells greater than:", lt: "Format cells less than:", eq: "Format cells equal to:",
      between: "Format cells between (two numbers, comma separated):", contains: "Format cells that contain the text:"
    };
    const input = prompt(labels[op], "");
    if (input === null || input.trim() === "") return;
    if (op === "contains") return core.addRule({ op, a: input.trim(), ...RULE_STYLE });
    if (op === "between") {
      const parts = input.split(",").map((x) => Number(x.trim()));
      if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return core.toast("Enter two numbers separated by a comma");
      return core.addRule({ op, a: Math.min(parts[0], parts[1]), b: Math.max(parts[0], parts[1]), ...RULE_STYLE });
    }
    const n = Number(input.trim());
    if (!Number.isFinite(n)) return core.toast("Enter a number");
    core.addRule({ op, a: n, ...RULE_STYLE });
  }

  // ---------- Home tab: Format Cells, Cell Styles, indent, text angle, add-ins ----------
  const STYLE_KEYS = ["bold", "italic", "underline", "size", "color", "fill", "border", "wrap", "angle", "indent"];
  const CELL_STYLES = {
    normal: {},
    heading: { bold: true, size: 14, color: "#107c41" },
    title: { bold: true, size: 20 },
    good: { fill: "#c6efce", color: "#006100" },
    bad: { fill: "#ffc7ce", color: "#9c0006" },
    neutral: { fill: "#ffeb9c", color: "#9c5700" },
    input: { fill: "#f2f2f2", border: true }
  };

  function activeStyleObj() {
    const c = core.getCell(core.sel.ar, core.sel.ac);
    return c ? c.s : {};
  }

  function applyCellStyle(name) {
    const reset = Object.fromEntries(STYLE_KEYS.map((k) => [k, null]));
    core.applyStyle(Object.assign(reset, CELL_STYLES[name] || {}));
  }

  function bumpIndent(d) {
    const cur = activeStyleObj().indent || 0;
    core.applyStyle({ indent: Math.max(0, Math.min(15, cur + d)) || null });
  }

  function showFormatCells() {
    const cur = activeStyleObj();
    const fillInit = cur.fill || "#ffffff";
    const colorInit = cur.color || "#201f1e";
    const opt = (v, t, sel) => `<option value="${v}"${sel ? " selected" : ""}>${t}</option>`;
    const d = dialog("Format Cells",
      `<div class="fmt-grid">
        <label>Number<select id="fcNf">${opt("general", "General", !cur.nf || cur.nf === "general")}${opt("number", "Number", cur.nf === "number")}${opt("currency", "Currency", cur.nf === "currency")}${opt("percent", "Percentage", cur.nf === "percent")}</select></label>
        <label>Horizontal<select id="fcHa">${opt("", "General", !cur.ha)}${opt("left", "Left", cur.ha === "left")}${opt("center", "Center", cur.ha === "center")}${opt("right", "Right", cur.ha === "right")}</select></label>
        <label>Vertical<select id="fcVa">${opt("top", "Top", cur.va === "top")}${opt("middle", "Middle", cur.va === "middle")}${opt("bottom", "Bottom", !cur.va || cur.va === "bottom")}</select></label>
        <label>Indent<input type="number" id="fcIndent" min="0" max="15" value="${cur.indent || 0}" /></label>
        <label>Angle (degrees)<input type="number" id="fcAngle" min="-90" max="90" step="5" value="${cur.angle || 0}" /></label>
        <label>Fill<input type="color" id="fcFill" value="${fillInit}" data-init="${cur.fill ? "1" : "0"}" /></label>
        <label>Font colour<input type="color" id="fcColor" value="${colorInit}" /></label>
        <label class="chk"><input type="checkbox" id="fcBold" ${cur.bold ? "checked" : ""}/> Bold</label>
        <label class="chk"><input type="checkbox" id="fcItalic" ${cur.italic ? "checked" : ""}/> Italic</label>
        <label class="chk"><input type="checkbox" id="fcUnder" ${cur.underline ? "checked" : ""}/> Underline</label>
        <label class="chk"><input type="checkbox" id="fcWrap" ${cur.wrap ? "checked" : ""}/> Wrap text</label>
        <label class="chk"><input type="checkbox" id="fcBorder" ${cur.border ? "checked" : ""}/> All borders</label>
      </div>`,
      [{ label: "Cancel" },
        { label: "OK", primary: true, onClick: (el) => {
          const q = (id) => el.querySelector("#" + id);
          const fillChanged = q("fcFill").value !== fillInit;
          core.applyStyle({
            nf: q("fcNf").value === "general" ? null : q("fcNf").value,
            ha: q("fcHa").value || null,
            va: q("fcVa").value === "bottom" ? null : q("fcVa").value,
            indent: Math.max(0, Math.min(15, Number(q("fcIndent").value) || 0)) || null,
            angle: Number(q("fcAngle").value) || null,
            fill: fillChanged || cur.fill ? q("fcFill").value : null,
            color: q("fcColor").value === colorInit && !cur.color ? null : q("fcColor").value,
            bold: q("fcBold").checked || null,
            italic: q("fcItalic").checked || null,
            underline: q("fcUnder").checked || null,
            wrap: q("fcWrap").checked || null,
            border: q("fcBorder").checked || null
          });
        } }]);
    return d;
  }

  function showAddIns() {
    dialog("Add-ins",
      `<p>No add-ins are installed in this version of Quadra Office.</p>
       <p>Add-ins will be listed here when they are available.</p>`,
      [{ label: "Close", primary: true }]);
  }

  // ---------- Page Layout: page setup, print preview and printing ----------
  const MM = 96 / 25.4; // CSS pixels per millimetre
  const PAPER = { A4: { w: 210, h: 297 }, Letter: { w: 216, h: 279 }, Legal: { w: 216, h: 356 } };
  const MARGINS = {
    normal: { t: 19, b: 19, l: 18, r: 18 }, wide: { t: 25, b: 25, l: 25, r: 25 }, narrow: { t: 13, b: 13, l: 8, r: 8 }
  };
  const PAGE_KEY = "quadra.pageSetup";
  const ACCENT_KEY = "quadra.accent";
  const FONT_KEY = "quadra.font";
  const PRESETS = {
    office: { accent: "#107c41", font: "Calibri" }, ocean: { accent: "#0f6cbd", font: "Calibri" },
    warm: { accent: "#c43e1c", font: "Georgia" }, mono: { accent: "#3b3a39", font: "Arial" }
  };
  let accentOverride = localStorage.getItem(ACCENT_KEY);
  const defaultPage = { orientation: "portrait", size: "A4", margins: "normal", scale: 100, fitW: false, fitH: false, printArea: null, titles: 0, breaks: [] };
  let pageSetup = Object.assign({}, defaultPage, JSON.parse(localStorage.getItem(PAGE_KEY) || "{}"));
  const savePage = () => localStorage.setItem(PAGE_KEY, JSON.stringify(pageSetup));

  function usedRect() {
    let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
    for (const k of core.cells.keys()) {
      const [r, c] = k.split(",").map(Number);
      const cell = core.getCell(r, c);
      if (core.cellValue(r, c) === null && !Object.keys(cell.s).length) continue;
      r1 = Math.min(r1, r); c1 = Math.min(c1, c); r2 = Math.max(r2, r); c2 = Math.max(c2, c);
    }
    return r2 < 0 ? null : { r1, c1, r2, c2 };
  }

  // Splits the print area into pages (down first, then across), honouring scale, fit, breaks and titles
  function layoutPages() {
    const area = pageSetup.printArea || usedRect();
    if (!area) return null;
    const paper = PAPER[pageSetup.size] || PAPER.A4;
    const land = pageSetup.orientation === "landscape";
    const pw = (land ? paper.h : paper.w) * MM, ph = (land ? paper.w : paper.h) * MM;
    const m = MARGINS[pageSetup.margins] || MARGINS.normal;
    const availW = pw - (m.l + m.r) * MM, availH = ph - (m.t + m.b) * MM;
    let scale = pageSetup.scale / 100;
    if (pageSetup.fitW || pageSetup.fitH) {
      let fs = 1;
      if (pageSetup.fitW) fs = Math.min(fs, availW / ((area.c2 - area.c1 + 1) * COL_W));
      if (pageSetup.fitH) fs = Math.min(fs, availH / ((area.r2 - area.r1 + 1) * ROW_H));
      scale = fs;
    }
    const cellW = availW / scale, cellH = availH / scale;
    const titleRows = [];
    for (let r = 0; r < Math.min(pageSetup.titles || 0, 50); r++) titleRows.push(r);
    const bodyStart = Math.max(area.r1, titleRows.length);
    const perPage = Math.max(1, Math.floor(cellH / ROW_H) - titleRows.length);
    const starts = [bodyStart];
    for (const b of [...pageSetup.breaks].sort((a, b) => a - b)) if (b > bodyStart && b <= area.r2 && b !== starts[starts.length - 1]) starts.push(b);
    const rowBlocks = [];
    starts.forEach((from, i) => {
      const to = i + 1 < starts.length ? starts[i + 1] - 1 : area.r2;
      for (let s = from; s <= to; s += perPage) rowBlocks.push([s, Math.min(to, s + perPage - 1)]);
    });
    const colsPer = Math.max(1, Math.floor(cellW / COL_W));
    const colBlocks = [];
    for (let c = area.c1; c <= area.c2; c += colsPer) colBlocks.push([c, Math.min(area.c2, c + colsPer - 1)]);
    const pages = [];
    for (const rb of rowBlocks) for (const cb of colBlocks) pages.push({ rows: rb, cols: cb });
    return { pages, pw, ph, m, scale, titleRows };
  }

  function pageInnerHtml(pg, L) {
    const cols = [];
    for (let c = pg.cols[0]; c <= pg.cols[1]; c++) cols.push(c);
    const rows = [...L.titleRows.filter((r) => r < pg.rows[0]), ...Array.from({ length: pg.rows[1] - pg.rows[0] + 1 }, (_, i) => pg.rows[0] + i)];
    const heads = core.sheetOpt.headingsPrint;
    const grid = core.sheetOpt.gridPrint;
    const td = (r, c) => {
      const cell = core.getCell(r, c);
      const st = cell ? cell.s : {};
      const v = core.cellValue(r, c);
      const hit = core.ruleFor(r, c, v);
      const fill = hit ? hit.fill : st.fill;
      const color = hit ? hit.color : st.color;
      const align = st.ha || (typeof v === "number" ? "right" : "left");
      const valign = { top: "top", middle: "middle" }[st.va] || "bottom";
      const border = st.border ? "1px solid #000" : grid ? "1px solid #c8c8c8" : "none";
      const style = `width:${COL_W}px;height:${ROW_H}px;text-align:${align};vertical-align:${valign};` +
        `border:${border};${fill ? `background:${fill};` : ""}${color ? `color:${color};` : ""}` +
        `${st.bold ? "font-weight:bold;" : ""}${st.italic ? "font-style:italic;" : ""}` +
        `${st.underline ? "text-decoration:underline;" : ""}font-size:${Math.round((st.size || 11) * 1.2)}px;` +
        `font-family:${st.font || "Calibri"},Arial,sans-serif;${st.indent ? `padding-left:${st.indent * 9}px;` : ""}`;
      return `<td style="${style}">${esc(core.displayText(v, st))}</td>`;
    };
    let html = `<table class="pt" style="zoom:${L.scale}">`;
    if (heads) html += `<tr><th class="ph"></th>${cols.map((c) => `<th class="ph">${engine().indexToCol(c)}</th>`).join("")}</tr>`;
    for (const r of rows) {
      html += `<tr>${heads ? `<th class="ph">${r + 1}</th>` : ""}${cols.map((c) => td(r, c)).join("")}</tr>`;
    }
    return html + "</table>";
  }

  function pageSectionHtml(pg, L, inline) {
    const m = L.m;
    const style = inline ? "" : `width:${L.pw}px;height:${L.ph}px;padding:${m.t}mm ${m.r}mm ${m.b}mm ${m.l}mm;`;
    return `<section class="pg" style="${style}">${pageInnerHtml(pg, L)}</section>`;
  }

  function showPrintPreview() {
    const L = layoutPages();
    if (!L) return core.toast("There is nothing to print yet");
    const k = 0.45;
    const body = `<div class="pv-wrap">${L.pages.map((pg) =>
      `<div class="pv-page" style="width:${L.pw * k}px;height:${L.ph * k}px"><div style="transform:scale(${k});transform-origin:0 0;width:${L.pw}px;height:${L.ph}px">${pageSectionHtml(pg, L, false)}</div></div>`
    ).join("")}</div>
      <p class="note">${L.pages.length} page${L.pages.length === 1 ? "" : "s"} · ${pageSetup.size} ${pageSetup.orientation} · ` +
      `${pageSetup.printArea ? "print area set" : "whole used range"} · scale ${Math.round(L.scale * 100)}%</p>`;
    dialog("Print Preview", body, [
      { label: "Close", primary: false },
      { label: "Print", primary: true, onClick: () => { printPages(L); return false; } }
    ]);
  }

  // Prints through the browser: only the pages are visible while printing
  function printPages(L) {
    const root = $("printRoot");
    root.innerHTML = L.pages.map((pg) => pageSectionHtml(pg, L, false)).join("");
    let styleEl = $("pageSizeStyle");
    if (!styleEl) { styleEl = document.createElement("style"); styleEl.id = "pageSizeStyle"; document.head.appendChild(styleEl); }
    const paper = PAPER[pageSetup.size] || PAPER.A4;
    const landscape = pageSetup.orientation === "landscape";
    styleEl.textContent = `@page { size: ${landscape ? paper.h + "mm " + paper.w + "mm" : paper.w + "mm " + paper.h + "mm"}; margin: 0; }`;
    window.print();
    root.innerHTML = "";
  }

  function setPage(key, value) {
    pageSetup[key] = value;
    savePage();
    core.toast("Page setup updated");
  }

  function setAccent(hex) {
    accentOverride = hex;
    localStorage.setItem(ACCENT_KEY, hex);
    document.documentElement.style.setProperty("--accent", hex);
    core.setPalette({ accent: hex });
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    setAccent(preset.accent);
    setFont(preset.font);
    core.toast("Theme applied: " + name[0].toUpperCase() + name.slice(1));
  }

  function setFont(name) {
    core.setDefaultFont(name);
    localStorage.setItem(FONT_KEY, name);
  }

  function pickBackground(remove) {
    if (remove) { core.setBackground(null); return core.toast("Background removed"); }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => { core.setBackground(img); core.toast("Background set for this session"); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function setPrintTitles() {
    const n = prompt("Rows to repeat at the top of every printed page (0 for none):", String(pageSetup.titles || 0));
    if (n === null) return;
    const v = Math.max(0, Math.min(50, Math.floor(Number(n)) || 0));
    setPage("titles", v);
  }

  function pageBreak(action) {
    const row = core.sel.ar;
    if (action === "insert") {
      if (!pageSetup.breaks.includes(row)) pageSetup.breaks.push(row);
      core.toast("Page break inserted above row " + (row + 1));
    } else if (action === "remove") {
      pageSetup.breaks = pageSetup.breaks.filter((b) => b !== row);
      core.toast("Page break removed");
    } else {
      pageSetup.breaks = [];
      core.toast("All page breaks removed");
    }
    savePage();
  }

  function printAreaAction(action) {
    if (action === "set") {
      const R = core.range();
      setPage("printArea", { r1: R.r1, c1: R.c1, r2: R.r2, c2: R.c2 });
    } else {
      setPage("printArea", null);
    }
  }

  // Scale to Fit selectors
  function scaleCommand(cmd, val) {
    if (cmd === "scaleW") setPage("fitW", val === "1");
    else if (cmd === "scaleH") setPage("fitH", val === "1");
    else setPage("scale", Number(val));
  }

  // Objects are rotated around their centre; "Send to Back" moves the newest object to the bottom of the stack
  function rotateObject() {
    const o = objects[objects.length - 1];
    if (!o) return core.toast("Insert a shape, text box or picture first");
    o.rot = ((o.rot || 0) + 90) % 360;
    redrawInk();
  }

  function sendObjectBack() {
    const o = objects.pop();
    if (!o) return core.toast("Insert a shape, text box or picture first");
    objects.unshift(o);
    redrawInk();
  }

  function applyCore(cmd, val) {
    switch (cmd) {
      case "margins": setPage("margins", val); return true;
      case "orientation": setPage("orientation", val); return true;
      case "paperSize": setPage("size", val); return true;
      case "printArea": printAreaAction(val); return true;
      case "breaks": pageBreak(val); return true;
      case "background": pickBackground(val === "remove"); return true;
      case "printTitles": setPrintTitles(); return true;
      case "scaleW": case "scaleH": case "scale": scaleCommand(cmd, val); return true;
      case "accent": setAccent(val); return true;
      case "defaultFont": setFont(val); core.toast("Default font: " + val); return true;
      case "pageTheme": applyPreset(val); return true;
      case "rotateObject": rotateObject(); return true;
      case "sendBack": sendObjectBack(); return true;
      default: return false;
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  }

  function command(cmd, val) {
    switch (cmd) {
      case "shareBook": showShare(); return true;
      case "copyLink": copyText(location.href.split("#")[0], "Link copied"); return true;
      case "linkSheet": copyText(location.href.split("#")[0] + "#Sheet1", "Link to this sheet copied"); return true;
      case "fullscreen": toggleFullscreen(); return true;
      case "stats": showStats(); return true;
      case "shortcuts": showShortcuts(); return true;
      case "functionList": showFunctionList(); return true;
      case "help": showHelp(); return true;
      case "whatsNew": showWhatsNew(); return true;
      case "feedback": showFeedback(); return true;
      case "insertFn": showInsertFunction(); return true;
      case "fnInsert": insertFunction(val); return true;
      case "chart": showChart(val); return true;
      case "draw": setDrawMode(val); return true;
      case "drawTouch": core.toast("Touch drawing is not available in this version"); return true;
      case "border": core.applyStyle({ border: val === "none" ? null : true }); return true;
      case "calcBook": core.refresh(); core.toast("All formulas are up to date"); return true;
      case "refreshAll": core.toast("No external data connections in this workbook"); return true;
      case "sheetViewDefault": core.toast("Default view"); return true;
      case "newBook": openBackstage("new"); return true;
      case "saveBook": saveBook(); return true;
      case "exportCsv": exportCsv(); return true;
      case "printBook": showPrintPreview(); return true;
      case "renameBook": renameBook(); return true;
      case "editingMode": case "viewingMode": case "reviewingMode":
        core.toast("Editing mode is always on in this version"); return true;
      case "themeOffice": core.toast("Office theme is active"); return true;
      case "formatCells": showFormatCells(); return true;
      case "addins": showAddIns(); return true;
      case "indentIn": bumpIndent(-1); return true;
      case "indentOut": bumpIndent(1); return true;
      case "angle": core.applyStyle({ angle: Number(val) || null }); return true;
      case "style": applyCellStyle(val); return true;
      case "checkbox": insertCheckbox(); return true;
      case "printPreview": showPrintPreview(); return true;
      case "pivot": showPivot(); return true;
      case "picturesFile": insertPicture(); return true;
      case "onlinePics": showList("Online Pictures", [["Status", "Online image search needs an internet image service, which this version does not include."],
        ["Alternative", "Use Pictures > This Device to insert an image from your computer."]]); return true;
      case "shape": insertShape(val); return true;
      case "textBox": insertTextBox(); return true;
      case "insertRows": core.editLines("row", false); return true;
      case "insertCols": core.editLines("col", false); return true;
      case "deleteRows": core.editLines("row", true); return true;
      case "deleteCols": core.editLines("col", true); return true;
      case "cfRule": addRuleFromPrompt(val); return true;
      case "cfClear": core.clearRules(); return true;
      default: return applyCore(cmd, val);
    }
  }

  // ---------- Wiring ----------
  function wire() {
    document.addEventListener("click", (e) => {
      const t = e.target;
      const appBtn = t.closest("[data-app]");
      if (appBtn) return launchApp(appBtn.dataset.app);
      const prof = t.closest("[data-profile]");
      if (prof) { closeFloating(); return profileAction(prof.dataset.profile); }
      const bsItem = t.closest("[data-bs]");
      if (bsItem) return showBsPanel(bsItem.dataset.bs);
      if (t.closest("[data-bs-back]")) return closeBackstage();
      const menuBtn = t.closest("[data-menu]");
      if (menuBtn) return openNamedMenu(menuBtn.dataset.menu, menuBtn);
      const cmdBtn = t.closest("[data-cmd]");
      if (cmdBtn && !cmdBtn.closest("#ribbon") && cmdBtn.tagName === "BUTTON" && !cmdBtn.disabled) {
        closeFloating();
        return core.run(cmdBtn.dataset.cmd, cmdBtn.dataset.val);
      }
      if (!t.closest("#popRoot, #appMenu, #profileMenu, #btnApps, #btnProfile")) closeFloating();
    });

    $("btnApps").addEventListener("click", () => {
      if (!$("appMenu").classList.contains("hidden")) return closeFloating();
      closeFloating();
      renderAppMenu();
      $("appMenu").classList.remove("hidden");
    });

    $("btnProfile").addEventListener("click", () => {
      if (!$("profileMenu").classList.contains("hidden")) return closeFloating();
      closeFloating();
      renderProfileMenu();
      $("profileMenu").classList.remove("hidden");
    });

    $("themeSwitch").addEventListener("click", toggleTheme);
    wrap.addEventListener("scroll", redrawInk);
    $("btnShare").addEventListener("click", showShare);
    $("btnStats").addEventListener("click", showStats);
    $("btnInsertFn").addEventListener("click", showInsertFunction);
    $("btnAddSheet").addEventListener("click", () => core.toast("Only one sheet in this version"));
    $("btnCollapse").addEventListener("click", () => {
      const collapsed = $("app").classList.toggle("ribbon-collapsed");
      $("btnCollapse").innerHTML = ic(collapsed ? "chevDown" : "chevUp");
      $("btnCollapse").title = collapsed ? "Expand the ribbon" : "Collapse the ribbon";
    });

    // File opens the backstage; the ribbon keeps the tab the user was on.
    document.querySelectorAll(".tab").forEach((t) => {
      t.addEventListener("click", () => {
        if (t.dataset.tab === "File") openBackstage("info");
        document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === currentTab));
      });
    });

    const search = $("searchBox");
    search.addEventListener("input", () => runSearch(search.value));
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const first = $("popRoot").querySelector(".mi:not(.dis)");
        if (first) first.click();
      }
      if (e.key === "Escape") { search.value = ""; search.blur(); closeFloating(); }
    });

    document.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "q" || e.key === "Q")) { e.preventDefault(); search.focus(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); saveBook(); return; }
      if (e.key === "Escape") {
        closeFloating();
        if (!$("backstage").classList.contains("hidden")) closeBackstage();
      }
    });
  }

  // ---------- Entry points ----------
  window.QuadraUI = {
    ribbonHtml,
    command,
    init(c) {
      core = c;
      wire();
      setupDrawing();
      const savedTheme = localStorage.getItem(THEME_KEY);
      applyTheme(savedTheme || "light");
      if (accentOverride) setAccent(accentOverride);
      const savedFont = localStorage.getItem(FONT_KEY);
      if (savedFont) core.setDefaultFont(savedFont);
      restoreSession();
      core.onChange(() => { scheduleSave(); updateStatus(); });
      updateStatus();
      setSaved("Saved");
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === currentTab));
    }
  };
})();
