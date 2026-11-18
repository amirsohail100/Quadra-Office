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
    ["MID", "Text", "Characters from the middle of text"],
    ["PMT", "Financial", "Payment for a loan with a fixed rate"],
    ["TODAY", "Date & Time", "Today's date as a serial number"],
    ["NOW", "Date & Time", "Current date and time as a serial number"],
    ["DATE", "Date & Time", "Serial number for a year, month and day"],
    ["YEAR", "Date & Time", "Year of a date serial number"],
    ["MONTH", "Date & Time", "Month of a date serial number"],
    ["DAY", "Date & Time", "Day of a date serial number"],
    ["VLOOKUP", "Lookup & Reference", "Looks up a value in the first column of a range"],
    ["HLOOKUP", "Lookup & Reference", "Looks up a value in the first row of a range"],
    ["INDEX", "Lookup & Reference", "Value at a row and column of a range"],
    ["MATCH", "Lookup & Reference", "Position of a value in a range"]
  ];

  // ---------- Small helpers ----------
  let core = null;
  let currentTab = "Home";
  const wrap = document.getElementById("gridWrap");
  // Grid geometry comes from the grid (it changes with zoom). Print pages always use 100% sizes.
  const geo = () => core.geom();
  const BASE = { COL_W: 64, ROW_H: 20 };
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
        bg("zoom", "Zoom", "zoom"),
        bg("zoomSelection", "Zoom to Selection", "zoom")),
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
    zoomMenu: [
      { label: "400%", cmd: "zoomPct", val: 400 }, { label: "200%", cmd: "zoomPct", val: 200 },
      { label: "150%", cmd: "zoomPct", val: 150 }, { label: "100%", cmd: "zoomPct", val: 100 },
      { label: "75%", cmd: "zoomPct", val: 75 }, { label: "50%", cmd: "zoomPct", val: 50 },
      { label: "25%", cmd: "zoomPct", val: 25 }, { sep: true },
      { label: "Zoom to Selection", cmd: "zoomSelection" }
    ],
    themes: [{ label: "Office", cmd: "themeOffice" }],
    calcOptions: [{ label: "Automatic", cmd: "calcAuto" }, { label: "Manual", cmd: "calcManual" }],
    getData: [{ label: "From Text/CSV…", cmd: "fromText" }, { label: "From Web", cmd: "fromWeb" }, { label: "From Access", cmd: "fromAccess" }],
    refresh: [{ label: "Refresh", cmd: "refreshAll" }, { label: "Refresh All", cmd: "refreshAll" }],
    dataTypes: [{ label: "Stocks", cmd: "dataTypes" }, { label: "Geography", cmd: "dataTypes" }],
    dataTools: [{ label: "Remove Duplicates", cmd: "removeDuplicates" }, { label: "Text to Columns…", cmd: "textToColumns" },
      { label: "Data Validation…", cmd: "dataValidation" }, { label: "Consolidate", cmd: "consolidate" },
      { label: "Relationships", cmd: "relationships" }],
    whatIf: [{ label: "Goal Seek…", cmd: "goalSeek" }, { label: "Scenario Manager", cmd: "scenarios" }, { label: "Data Table", cmd: "dataTable" }],
    outline: [{ label: "Group", cmd: "group" }, { label: "Ungroup", cmd: "ungroup" }, { label: "Subtotal…", cmd: "subtotal" }],
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
    // open below the button, or above it when there is no room below (status bar and bottom buttons)
    const h = menu.offsetHeight;
    const top = r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    menu.style.top = top + "px";
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
      ["F2", "Edit the active cell"], ["Enter / Tab", "Move to the next cell"], ["Delete", "Clear values"]
    ]);
  }

  function showFunctionList() {
    showList("Function List", FUNCS.map((f) => [f[0], f[2]]));
  }

  function showHelp() { openHelp(); }

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
    objects.push({ ...o, x: geo().HDR_W + sel.ac * geo().COL_W + 24, y: geo().HDR_H + sel.ar * geo().ROW_H + 24 });
    redrawInk();
  }

  function drawObjects(ctx, sx, sy, W, H) {
    const pal = core.pal;
    ctx.save();
    ctx.beginPath(); ctx.rect(geo().HDR_W, geo().HDR_H, W - geo().HDR_W, H - geo().HDR_H); ctx.clip();
    for (const o of objects) {
      const x = o.x - sx, y = o.y - sy;
      if (x > W || y > H || x + o.w < geo().HDR_W || y + o.h < geo().HDR_H) continue;
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

  // ---------- Sheet tabs ----------
  let tabsKey = "";
  function renderSheetTabs(force) {
    const list = core.sheetList();
    const key = JSON.stringify(list);
    if (!force && key === tabsKey) return;
    tabsKey = key;
    $("sheetTabs").innerHTML = list.map((x, i) =>
      `<button class="sheet-tab${x.active ? " active" : ""}" data-sheet="${i}" title="Double-click to rename">${esc(x.name)}</button>`).join("");
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
    const end = () => { draw.cur = null; saveInk(); };
    draw.layer.addEventListener("pointerup", end);
    draw.layer.addEventListener("pointercancel", end);
    loadInk();
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
      if (pageSetup.fitW) fs = Math.min(fs, availW / ((area.c2 - area.c1 + 1) * BASE.COL_W));
      if (pageSetup.fitH) fs = Math.min(fs, availH / ((area.r2 - area.r1 + 1) * BASE.ROW_H));
      scale = fs;
    }
    const cellW = availW / scale, cellH = availH / scale;
    const titleRows = [];
    for (let r = 0; r < Math.min(pageSetup.titles || 0, 50); r++) titleRows.push(r);
    const bodyStart = Math.max(area.r1, titleRows.length);
    const perPage = Math.max(1, Math.floor(cellH / BASE.ROW_H) - titleRows.length);
    const starts = [bodyStart];
    for (const b of [...pageSetup.breaks].sort((a, b) => a - b)) if (b > bodyStart && b <= area.r2 && b !== starts[starts.length - 1]) starts.push(b);
    const rowBlocks = [];
    starts.forEach((from, i) => {
      const to = i + 1 < starts.length ? starts[i + 1] - 1 : area.r2;
      for (let s = from; s <= to; s += perPage) rowBlocks.push([s, Math.min(to, s + perPage - 1)]);
    });
    const colsPer = Math.max(1, Math.floor(cellW / BASE.COL_W));
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
      const style = `width:${BASE.COL_W}px;height:${BASE.ROW_H}px;text-align:${align};vertical-align:${valign};` +
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

  // ---------- Formulas and Data tabs ----------
  const addr = (r, c) => engine().indexToCol(c) + (r + 1);
  const rectAddr = (R) => addr(R.r1, R.c1) + (R.r1 === R.r2 && R.c1 === R.c2 ? "" : ":" + addr(R.r2, R.c2));
  const validName = (n) => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) && !/^(TRUE|FALSE)$/i.test(n);
  const parseAddr = (t) => {
    const m = /^\s*\$?([A-Za-z]{1,3})\$?(\d+)\s*$/.exec(t || "");
    return m ? { r: Number(m[2]) - 1, c: engine().colToIndex(m[1]) } : null;
  };

  function notAvailable(title, why) {
    dialog(title, `<p>${esc(why)}</p>`, [{ label: "Close", primary: true }]);
  }

  function defineNameCmd() {
    const R = core.range();
    const name = prompt("Name for " + rectAddr(R) + ":", "");
    if (name === null) return;
    const n = name.trim();
    if (!validName(n)) return core.toast("Names use letters, digits, _ or . and cannot look like a cell address");
    core.defineName(n, R);
    core.toast(`Defined ${n} = ${rectAddr(R)}`);
  }

  function nameManager() {
    const list = core.getNames();
    const rows = list.length
      ? list.map(([n, R]) => `<tr><th>${esc(n)}</th><td>${esc(rectAddr(R))}</td><td><button class="btn" data-del="${esc(n)}">Delete</button></td></tr>`).join("")
      : `<tr><td colspan="3">No names are defined yet. Select cells and use Define Name.</td></tr>`;
    const d = dialog("Name Manager", `<table class="list">${rows}</table>`, [{ label: "Close", primary: true }]);
    d.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-del]");
      if (!b) return;
      core.deleteName(b.dataset.del);
      d.close();
      nameManager();
    });
  }

  function useInFormula() {
    const list = core.getNames();
    if (!list.length) return core.toast("Define a name first");
    const d = dialog("Use in Formula",
      `<p>Choose a name to put in the active cell:</p>${list.map(([n, R]) =>
        `<button class="fn-item" data-name="${esc(n)}"><b>${esc(n)}</b><span>${esc(rectAddr(R))}</span></button>`).join("")}`,
      [{ label: "Cancel" }]);
    d.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-name]");
      if (!b) return;
      d.close();
      core.openEditor("=" + b.dataset.name);
    });
  }

  function createFromSelection() {
    const R = core.range();
    if (R.r2 === R.r1) return core.toast("Select a header row and the data below it");
    const made = [];
    for (let c = R.c1; c <= R.c2; c++) {
      let n = core.displayText(core.cellValue(R.r1, c), {}).trim().replace(/[^A-Za-z0-9_.]+/g, "_").replace(/^(\d)/, "_$1");
      if (!n || !validName(n)) continue;
      core.defineName(n, { r1: R.r1 + 1, c1: c, r2: R.r2, c2: c });
      made.push(n);
    }
    core.toast(made.length ? "Created names: " + made.join(", ") : "The top row has no usable header text");
  }

  function tracePrecedents() {
    const cell = core.getCell(core.sel.ar, core.sel.ac);
    const refs = cell ? engine().referencesOf(cell.v) : [];
    if (!refs.length) return core.toast("The active cell has no references to trace");
    core.setExtras(refs);
    core.toast(`${refs.length} precedent range(s) highlighted. Remove Arrows clears them.`);
  }

  function traceDependents() {
    const tr = core.sel.ar, tc = core.sel.ac;
    const hits = [];
    for (const k of core.cells.keys()) {
      const [r, c] = k.split(",").map(Number);
      const cell = core.getCell(r, c);
      if (!cell || cell.v[0] !== "=") continue;
      if (engine().referencesOf(cell.v).some((R) => tr >= R.r1 && tr <= R.r2 && tc >= R.c1 && tc <= R.c2)) {
        hits.push({ r1: r, c1: c, r2: r, c2: c });
      }
    }
    if (!hits.length) return core.toast("No formula uses the active cell");
    core.setExtras(hits);
    core.toast(`${hits.length} dependent cell(s) highlighted. Remove Arrows clears them.`);
  }

  function errorChecking() {
    const E = engine();
    const errs = [];
    for (const k of core.cells.keys()) {
      const [r, c] = k.split(",").map(Number);
      const v = core.cellValue(r, c);
      if (E.isError(v)) errs.push({ r, c, code: v.code });
    }
    errs.sort((a, b) => a.r - b.r || a.c - b.c);
    const body = errs.length
      ? `<table class="list">${errs.map((e, i) => `<tr><th>${addr(e.r, e.c)}</th><td>${esc(e.code)}</td>` +
          `<td><button class="btn" data-go="${i}">Go to</button></td></tr>`).join("")}</table>`
      : "<p>No errors found on this sheet.</p>";
    const d = dialog("Error Checking", body, [{ label: "Close", primary: true }]);
    d.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-go]");
      if (!b) return;
      const hit = errs[+b.dataset.go];
      d.close();
      core.goTo(hit.r, hit.c);
    });
  }

  function evaluateFormula() {
    const cell = core.getCell(core.sel.ar, core.sel.ac);
    if (!cell || cell.v[0] !== "=") return core.toast("Select a cell that contains a formula");
    const steps = engine().substituteRefs(cell.v, (r, c) => core.cellValue(r, c));
    const shown = core.displayText(core.cellValue(core.sel.ar, core.sel.ac), cell.s);
    dialog("Evaluate Formula",
      `<p>Formula: <code>${esc(cell.v)}</code></p>
       <p>With the current values: <code>${esc(steps)}</code></p>
       <p>Result: <b>${esc(shown)}</b></p>
       <p class="note">Each reference is replaced by the value it holds. The whole formula is then calculated at once.</p>`,
      [{ label: "Close", primary: true }]);
  }

  function setCalcMode(auto) {
    core.setAutoCalc(auto);
    core.toast(auto ? "Calculation: Automatic" : "Calculation: Manual. Use Calculate Sheet to update formulas.");
  }

  // Data > Get Data > From Text/CSV: reads a CSV file into the sheet from the active cell
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
        } else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch !== "\r") cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function importCsv() {
    if (core.isProtected()) return core.toast("Sheet is protected. Unprotect it to edit.");
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const rows = parseCsv(String(reader.result));
        const width = Math.max(0, ...rows.map((r) => r.length));
        if (rows.length * width > 100000) return core.toast("This CSV file is too large for this version");
        const r0 = core.sel.ar, c0 = core.sel.ac;
        rows.forEach((row, i) => row.forEach((v, j) => core.setValue(r0 + i, c0 + j, v)));
        core.goTo(r0, c0);
        core.refresh();
        core.toast(`Imported ${rows.length} row(s) from ${file.name}`);
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function customSort() {
    const R = core.range();
    if (R.r2 === R.r1) return core.toast("Select a table first");
    const cols = [];
    for (let c = R.c1; c <= R.c2; c++) cols.push(c);
    const headerOf = (c) => core.displayText(core.cellValue(R.r1, c), {}) || engine().indexToCol(c);
    const opts = cols.map((c) => `<option value="${c}">${esc(headerOf(c))}</option>`).join("");
    const d = dialog("Sort",
      `<label class="chk"><input type="checkbox" id="csHeaders" checked /> My data has headers</label>
       <label>Sort by<select id="csKey1">${opts}</select></label>
       <label>Order<select id="csOrd1"><option value="asc">A to Z</option><option value="desc">Z to A</option></select></label>
       <label>Then by<select id="csKey2"><option value="">(none)</option>${opts}</select></label>
       <label>Order<select id="csOrd2"><option value="asc">A to Z</option><option value="desc">Z to A</option></select></label>`,
      [{ label: "Cancel" },
        { label: "Sort", primary: true, onClick: (el) => {
          const keys = [{ c: Number(el.querySelector("#csKey1").value), asc: el.querySelector("#csOrd1").value === "asc" }];
          const k2 = el.querySelector("#csKey2").value;
          if (k2 !== "") keys.push({ c: Number(k2), asc: el.querySelector("#csOrd2").value === "asc" });
          const headers = el.querySelector("#csHeaders").checked;
          core.goTo(headers ? R.r1 + 1 : R.r1, R.c1, R.r2, R.c2);
          core.sortByKeys(keys);
          core.toast("Sorted");
        } }]);
    return d;
  }

  function dataValidation() {
    dialog("Data Validation",
      `<label>Allow
         <select id="dvType"><option value="any">Any value</option><option value="list">List</option>
           <option value="number">Number between</option></select></label>
       <label>List items (separated by commas)<input id="dvList" type="text" /></label>
       <label>Minimum<input id="dvMin" type="number" /></label>
       <label>Maximum<input id="dvMax" type="number" /></label>
       <label>Error message<input id="dvMsg" type="text" /></label>
       <p class="note">Typed values that break the rule are refused while you type. Pasted values are not checked.</p>`,
      [{ label: "Cancel" },
        { label: "OK", primary: true, onClick: (el) => {
          const type = el.querySelector("#dvType").value;
          const message = el.querySelector("#dvMsg").value.trim() || undefined;
          if (type === "any") return core.setValidation(null);
          if (type === "list") {
            const list = el.querySelector("#dvList").value.split(",").map((x) => x.trim()).filter(Boolean);
            if (!list.length) { core.toast("Enter at least one list item"); return false; }
            return core.setValidation({ type: "list", list, message });
          }
          const mn = el.querySelector("#dvMin").value, mx = el.querySelector("#dvMax").value;
          core.setValidation({ type: "number", min: mn === "" ? undefined : Number(mn), max: mx === "" ? undefined : Number(mx), message });
        } }]);
  }

  function textToColumns() {
    const R = core.range();
    dialog("Text to Columns",
      `<label>Separator
         <select id="ttDelim"><option value=",">Comma</option><option value=";">Semicolon</option>
           <option value="\t">Tab</option><option value=" ">Space</option></select></label>
       <p class="note">The text in the first column of the selection is split into the columns to its right.</p>`,
      [{ label: "Cancel" },
        { label: "OK", primary: true, onClick: (el) => {
          if (core.isProtected()) return core.toast("Sheet is protected. Unprotect it to edit.");
          const delim = el.querySelector("#ttDelim").value;
          let changed = 0;
          for (let r = R.r1; r <= R.r2; r++) {
            const text = core.displayText(core.cellValue(r, R.c1), {});
            if (!text.includes(delim)) continue;
            text.split(delim).forEach((part, j) => { core.setValue(r, R.c1 + j, part.trim()); });
            changed++;
          }
          core.refresh();
          core.toast(changed ? `Split ${changed} row(s)` : "No separator found in the first column");
        } }]);
  }

  // Goal Seek: finds the value of one cell that makes another cell reach a target (bisection)
  function goalSeek() {
    const d = dialog("Goal Seek",
      `<label>Set cell<input id="gsSet" type="text" value="${esc(addr(core.sel.ar, core.sel.ac))}" /></label>
       <label>To value<input id="gsTo" type="number" value="0" /></label>
       <label>By changing cell<input id="gsBy" type="text" placeholder="for example B2" /></label>`,
      [{ label: "Cancel" },
        { label: "Seek", primary: true, onClick: (el) => {
          const set = parseAddr(el.querySelector("#gsSet").value);
          const by = parseAddr(el.querySelector("#gsBy").value);
          const target = Number(el.querySelector("#gsTo").value);
          if (!set || !by || !Number.isFinite(target)) { core.toast("Enter two cell addresses and a number"); return false; }
          runGoalSeek(set, by, target);
        } }]);
    return d;
  }

  function runGoalSeek(set, by, target) {
    const base = core.historyLength();
    const original = core.getCell(by.r, by.c) ? core.getCell(by.r, by.c).v : "";
    const f = (x) => {
      core.setValue(by.r, by.c, String(x));
      core.calcNow();
      const v = core.cellValue(set.r, set.c);
      return typeof v === "number" ? v - target : NaN;
    };
    const restore = () => { core.setValue(by.r, by.c, original); core.calcNow(); core.trimHistory(base); };
    // Look for a sign change on a geometric grid (1e-6 .. 1e6, both signs), then bisect inside it
    const grid = [];
    for (let k = -120; k <= 120; k++) grid.push(k === 0 ? 0 : Math.sign(k) * Math.pow(10, k / 20));
    let lo = null, hi = null, flo = 0, fhi = 0, prevX = grid[0], prevF = f(prevX);
    for (let i = 1; i < grid.length && lo === null; i++) {
      const fx = f(grid[i]);
      if (Number.isFinite(prevF) && Number.isFinite(fx) && prevF * fx <= 0) {
        lo = prevX; hi = grid[i]; flo = prevF; fhi = fx;
      }
      prevX = grid[i]; prevF = fx;
    }
    if (lo === null) {
      restore();
      return core.toast("No solution found for values between -1,000,000 and 1,000,000");
    }
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, fm = f(mid);
      if (!Number.isFinite(fm)) break;
      if (Math.abs(fm) < 1e-9) { lo = hi = mid; break; }
      if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
    }
    const x = Number(((lo + hi) / 2).toPrecision(12));
    restore();
    core.setValue(by.r, by.c, String(x));
    core.calcNow();
    core.toast(`Goal seek: ${addr(by.r, by.c)} = ${x}`);
  }

  // Forecast Sheet: a straight-line trend through the x/y pairs, with three rows added below the data
  function forecastSheet() {
    const R = core.range();
    if (R.c2 - R.c1 < 1 || R.r2 - R.r1 < 2) return core.toast("Select an x column and a y column with a header row");
    const xs = [], ys = [];
    for (let r = R.r1 + 1; r <= R.r2; r++) {
      const x = core.cellValue(r, R.c1), y = core.cellValue(r, R.c1 + 1);
      if (typeof x === "number" && typeof y === "number") { xs.push(x); ys.push(y); }
    }
    if (xs.length < 2) return core.toast("Need at least two rows with numbers in both columns");
    const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    const slope = den ? num / den : 0, intercept = my - slope * mx;
    const step = n > 1 ? (xs[n - 1] - xs[n - 2]) || 1 : 1;
    const top = R.r2 + 2;
    core.setValue(top, R.c1, "Forecast x");
    core.setValue(top, R.c1 + 1, "Forecast y");
    core.getOrCreate(top, R.c1).s.bold = true;
    core.getOrCreate(top, R.c1 + 1).s.bold = true;
    for (let k = 1; k <= 3; k++) {
      const x = xs[n - 1] + k * step;
      core.setValue(top + k, R.c1, String(x));
      core.setValue(top + k, R.c1 + 1, String(Number((intercept + slope * x).toPrecision(10))));
    }
    core.refresh();
    core.toast("Forecast added below the data (straight-line trend)");
  }

  // Data > Outline > Subtotal: adds a Total row under each group (groups are the runs of equal values in the first column)
  function subtotal() {
    const R = core.range();
    if (R.r2 - R.r1 < 2) return core.toast("Select a header row and at least two data rows");
    if (core.isProtected()) return core.toast("Sheet is protected. Unprotect it to edit.");
    const key = (r) => core.displayText(core.cellValue(r, R.c1), {});
    const groups = [];
    let start = R.r1 + 1;
    for (let r = R.r1 + 2; r <= R.r2 + 1; r++) {
      if (r > R.r2 || key(r) !== key(start)) { groups.push([start, r - 1]); start = r; }
    }
    for (const [g1, g2] of groups.slice().reverse()) {
      const at = g2 + 1;
      core.goTo(at, R.c1);
      core.editLines("row", false);
      core.setValue(at, R.c1, "Total " + key(g1));
      core.getOrCreate(at, R.c1).s.bold = true;
      for (let c = R.c1 + 1; c <= R.c2; c++) {
        let any = false;
        for (let r = g1; r <= g2; r++) if (typeof core.cellValue(r, c) === "number") any = true;
        if (any) {
          const col = engine().indexToCol(c);
          core.setValue(at, c, `=SUM(${col}${g1 + 1}:${col}${g2 + 1})`);
        }
      }
    }
    core.goTo(R.r1, R.c1, R.r2 + groups.length, R.c2);
    core.refresh();
    core.toast(`Added ${groups.length} subtotal row(s)`);
  }

  const NOT_HERE = {
    fromWeb: ["From Web", "Importing from a web page needs an internet connection and a data service. This version does not include one."],
    fromAccess: ["From Access", "Access databases need a desktop connection to the database file. This version does not include that."],
    queries: ["Queries & Connections", "Queries need an external data source. This version works with the sheet and CSV files only."],
    workbookLinks: ["Workbook Links", "Links to other workbooks are not available in this version."],
    recentSources: ["Recent Sources", "Recent sources lists external data connections, which this version does not have."],
    dataTypes: ["Data Types", "Stocks and geography data types need an online data service, which this version does not include."],
    scenarios: ["Scenario Manager", "Scenario Manager saves sets of input values. It is not available in this version."],
    dataTable: ["Data Table", "What-if data tables are not available in this version. Use Goal Seek for a single value."],
    consolidate: ["Consolidate", "Consolidate combines several ranges by their labels. It is not available in this version."],
    relationships: ["Relationships", "Relationships and the data model need Power Pivot, which this version does not include."],
    filter: ["Filter", "Filtering hides rows. The grid cannot hide rows yet, so Filter is not available in this version."],
    group: ["Group", "Grouping collapses rows. The grid cannot hide rows yet, so Group is not available in this version."],
    ungroup: ["Ungroup", "Ungrouping needs grouped rows, which this version does not support yet."]
  };

  // Returns true when the command belongs to the Formulas or Data tab
  function formulasAndData(cmd, val) {
    if (NOT_HERE[cmd]) { notAvailable(NOT_HERE[cmd][0], NOT_HERE[cmd][1]); return true; }
    switch (cmd) {
      case "defineName": defineNameCmd(); return true;
      case "nameManager": nameManager(); return true;
      case "useInFormula": useInFormula(); return true;
      case "createFromSelection": createFromSelection(); return true;
      case "tracePrecedents": tracePrecedents(); return true;
      case "traceDependents": traceDependents(); return true;
      case "removeArrows": core.setExtras([]); core.toast("Arrows removed"); return true;
      case "errorChecking": errorChecking(); return true;
      case "evaluateFormula": evaluateFormula(); return true;
      case "calcAuto": setCalcMode(true); return true;
      case "calcManual": setCalcMode(false); return true;
      case "calcBook": core.calcNow(); core.toast("All formulas calculated"); return true;
      case "fromText": importCsv(); return true;
      case "fromTable": core.run("table"); return true;
      case "customSort": customSort(); return true;
      case "reapply": core.reapplySort(); return true;
      case "clearSort": core.toast("Nothing to clear: no filter is active"); return true;
      case "dataValidation": dataValidation(); return true;
      case "textToColumns": textToColumns(); return true;
      case "goalSeek": goalSeek(); return true;
      case "forecast": forecastSheet(); return true;
      case "subtotal": subtotal(); return true;
      default: return false;
    }
  }

  // ---------- Review, View, Help and Draw ----------
  const VER_KEY = "quadra.versions", VIEW_KEY = "quadra.views", INK_KEY = "quadra.ink";
  const DEFAULT_VIEW = { zoom: 1, gridView: true, headingsView: true, formulaBar: true, focusCell: false };
  const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  let pausedProtect = false;

  function updateZoomLabel() {
    $("zoomLabel").textContent = Math.round(core.geom().zoom * 100) + "%";
  }

  function setZoomPct(p) {
    const z = Math.max(0.25, Math.min(4, p / 100));
    localStorage.setItem("quadra.zoom", String(z));
    core.setZoom(z);
    updateZoomLabel();
    core.relayout();
    core.toast("Zoom " + Math.round(z * 100) + "%");
  }

  function stepZoom(dir) {
    const cur = core.geom().zoom;
    const idx = ZOOM_STEPS.reduce((best, v, i) => (Math.abs(v - cur) < Math.abs(ZOOM_STEPS[best] - cur) ? i : best), 0);
    const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + dir))];
    setZoomPct(next * 100);
  }

  function zoomToSelection() {
    const R = core.range();
    const width = (R.c2 - R.c1 + 1) * 64;
    const avail = wrap.clientWidth - 48;
    setZoomPct(Math.max(25, Math.min(400, Math.floor((avail / width) * 100))));
  }

  function zoomPrompt() {
    const p = prompt("Zoom percentage (25 to 400):", String(Math.round(core.geom().zoom * 100)));
    if (p === null || !Number.isFinite(Number(p))) return;
    setZoomPct(Number(p));
  }

  // Sheet views: zoom, gridlines, headings, formula bar and focus cell can be saved under a name
  const currentView = () => ({
    zoom: core.geom().zoom, gridView: core.sheetOpt.gridView, headingsView: core.sheetOpt.headingsView,
    formulaBar: core.sheetOpt.formulaBar, focusCell: !!core.sheetOpt.focusCell
  });
  const savedViews = () => JSON.parse(localStorage.getItem(VIEW_KEY) || "[]");

  function applyView(v) {
    core.setZoom(v.zoom);
    core.sheetOpt.gridView = v.gridView;
    core.sheetOpt.headingsView = v.headingsView;
    core.sheetOpt.formulaBar = v.formulaBar;
    core.sheetOpt.focusCell = !!v.focusCell;
    document.querySelector(".formula-bar").style.display = v.formulaBar ? "" : "none";
    updateZoomLabel();
    core.relayout();
    core.refresh();
    core.toast("View applied");
  }

  function saveViewPrompt() {
    const name = prompt("Name for this view:", "View " + (savedViews().length + 1));
    if (name === null || !name.trim()) return;
    const list = savedViews().filter((v) => v.name !== name.trim());
    list.push({ name: name.trim(), ...currentView() });
    localStorage.setItem(VIEW_KEY, JSON.stringify(list));
    core.toast("Saved view " + name.trim());
  }

  function customViews() {
    const list = savedViews();
    const rows = list.length
      ? list.map((v, i) => `<tr><th>${esc(v.name)}</th><td>${Math.round(v.zoom * 100)}%</td>` +
          `<td><button class="btn" data-apply="${i}">Apply</button> <button class="btn" data-drop="${i}">Delete</button></td></tr>`).join("")
      : `<tr><td colspan="3">No saved views yet. Use Save to keep the current view.</td></tr>`;
    const d = dialog("Custom Views", `<table class="list">${rows}</table>`,
      [{ label: "Save current view", onClick: () => { saveViewPrompt(); return false; } }, { label: "Close", primary: true }]);
    d.el.addEventListener("click", (e) => {
      const a = e.target.closest("[data-apply]"), dr = e.target.closest("[data-drop]");
      if (a) { d.close(); applyView(list[+a.dataset.apply]); }
      if (dr) {
        localStorage.setItem(VIEW_KEY, JSON.stringify(list.filter((_, i) => i !== +dr.dataset.drop)));
        d.close();
        customViews();
      }
    });
  }

  function navigation() {
    const items = [];
    for (const [name, R] of core.getNames()) items.push([`Name: ${name}`, `${rectAddr(R)}`, R]);
    for (const k of core.cells.keys()) {
      const [r, c] = k.split(",").map(Number);
      const cell = core.getCell(r, c);
      if (cell.comment) items.push(["Comment", `${addr(r, c)}: ${cell.comment}`, { r1: r, c1: c, r2: r, c2: c }]);
      if (engine().isError(core.cellValue(r, c))) items.push(["Error", `${addr(r, c)}: ${core.cellValue(r, c).code}`, { r1: r, c1: c, r2: r, c2: c }]);
    }
    const body = items.length
      ? `<table class="list">${items.slice(0, 300).map((it, i) => `<tr><th>${esc(it[0])}</th><td>${esc(it[1])}</td>` +
          `<td><button class="btn" data-nav="${i}">Go</button></td></tr>`).join("")}</table>`
      : "<p>Names, comments and errors will be listed here.</p>";
    const d = dialog("Navigation", body, [{ label: "Close", primary: true }]);
    d.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-nav]");
      if (!b) return;
      const R = items[+b.dataset.nav][2];
      d.close();
      core.goTo(R.r1, R.c1, R.r2, R.c2);
    });
  }

  function immersiveReader() {
    if (!("speechSynthesis" in window)) return core.toast("Reading aloud is not supported in this browser");
    const R = core.range();
    if ((R.r2 - R.r1 + 1) * (R.c2 - R.c1 + 1) > 2000) return core.toast("Select a smaller range to read");
    const parts = [];
    for (let r = R.r1; r <= R.r2; r++) {
      for (let c = R.c1; c <= R.c2; c++) {
        const cell = core.getCell(r, c);
        const t = core.displayText(core.cellValue(r, c), cell ? cell.s : {});
        if (t) parts.push(t);
      }
    }
    const text = parts.join(". ") || "Nothing to read. Select some cells.";
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    dialog("Immersive Reader", `<p>Reading the selected cells aloud.</p><p class="note">${esc(text.slice(0, 500))}</p>`,
      [{ label: "Stop", onClick: () => { speechSynthesis.cancel(); } }, { label: "Close", primary: true }]);
  }

  // Versions: a saved copy of the workbook, kept in this browser
  const versions = () => JSON.parse(localStorage.getItem(VER_KEY) || "[]");

  function saveVersion(name) {
    const list = [{ name, time: new Date().toLocaleString(), json: core.serialize() }, ...versions()].slice(0, 20);
    localStorage.setItem(VER_KEY, JSON.stringify(list));
    core.toast("Version saved: " + name);
  }

  function versionHistory() {
    const list = versions();
    const rows = list.length
      ? list.map((v, i) => `<tr><th>${esc(v.name)}</th><td>${esc(v.time)}</td>` +
          `<td><button class="btn" data-restore="${i}">Restore</button></td></tr>`).join("")
      : `<tr><td colspan="3">No versions yet. Save one to start the history.</td></tr>`;
    const d = dialog("Version History", `<table class="list">${rows}</table>`,
      [{ label: "Save current version", onClick: () => {
          const name = prompt("Name for this version:", "Version " + (list.length + 1));
          if (name && name.trim()) saveVersion(name.trim());
          return false;
        } }, { label: "Close", primary: true }]);
    d.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-restore]");
      if (!b) return;
      d.close();
      core.load(list[+b.dataset.restore].json);
      core.toast("Restored " + list[+b.dataset.restore].name);
    });
  }

  // The cells of the active sheet, read from a saved workbook (old and new formats)
  function parseEntries(json) {
    const o = JSON.parse(json);
    if (Array.isArray(o)) return new Map(o);
    if (o.s) return new Map(o.s[o.a || 0].c);
    return new Map(o.c);
  }

  // Shows the cells that differ from the newest saved version (highlighted like Ctrl+click selections)
  function showChanges() {
    const list = versions();
    if (!list.length) return core.toast("Save a version first (Version History), then Show Changes compares against it");
    const before = parseEntries(list[0].json), now = parseEntries(core.serialize());
    const rects = [];
    for (const k of new Set([...before.keys(), ...now.keys()])) {
      if (JSON.stringify(before.get(k) || null) === JSON.stringify(now.get(k) || null)) continue;
      const [r, c] = k.split(",").map(Number);
      rects.push({ r1: r, c1: c, r2: r, c2: c });
    }
    if (!rects.length) return core.toast("No changes since the newest saved version");
    core.setExtras(rects);
    core.toast(`${rects.length} changed cell(s) highlighted. Remove Arrows clears them.`);
  }

  function accessibilityCheck() {
    const issues = [];
    for (const k of core.cells.keys()) {
      const [r, c] = k.split(",").map(Number);
      const cell = core.getCell(r, c);
      const v = core.cellValue(r, c);
      if (engine().isError(v)) issues.push(`${addr(r, c)}: error ${v.code}`);
      if (cell.s.size && cell.s.size < 9 && v !== null) issues.push(`${addr(r, c)}: text is smaller than 9 pt`);
    }
    dialog("Accessibility Check",
      issues.length ? `<ul>${issues.slice(0, 200).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "<p>No accessibility issues found.</p>",
      [{ label: "Close", primary: true }]);
  }

  // Pause Protection switches sheet protection off; pressing it again switches it back on
  function pauseProtection() {
    if (core.isProtected()) {
      core.setProtected(false);
      pausedProtect = true;
      core.toast("Protection paused. Press Pause Protection again to turn it back on.");
    } else if (pausedProtect) {
      core.setProtected(true);
      pausedProtect = false;
      core.toast("Protection is on again");
    } else {
      core.toast("This sheet is not protected");
    }
  }

  // Draw: the ink is kept in this browser; Draw with Touch lets a finger or stylus draw without scrolling
  function saveInk() {
    localStorage.setItem(INK_KEY, JSON.stringify(draw.strokes));
  }

  function loadInk() {
    try {
      const saved = JSON.parse(localStorage.getItem(INK_KEY) || "[]");
      if (Array.isArray(saved)) draw.strokes = saved;
    } catch (e) {
      console.error(e);
    }
  }

  function toggleTouchDraw() {
    draw.touch = !draw.touch;
    draw.layer.style.touchAction = draw.touch ? "none" : "";
    if (draw.touch && draw.mode === "pointer") setDrawMode("pen");
    document.querySelectorAll('[data-cmd="drawTouch"]').forEach((b) => b.classList.toggle("on", draw.touch));
    core.toast(draw.touch ? "Touch drawing is on" : "Touch drawing is off");
  }

  // Home > Editing extras: Fill Right, Fill Series, Replace and Go To
  function fillRight() {
    if (core.isProtected()) return core.toast("Sheet is protected. Unprotect it to edit.");
    const R = core.range();
    if (R.c2 === R.c1) return core.toast("Select at least two columns; the left column is the source");
    for (let r = R.r1; r <= R.r2; r++) {
      const src = core.getCell(r, R.c1);
      for (let c = R.c1 + 1; c <= R.c2; c++) {
        core.setValue(r, c, src ? engine().shiftFormula(src.v, 0, c - R.c1) : "");
      }
    }
    core.refresh();
    core.toast("Filled right");
  }

  // Linear series: the first two numbers of the top-left column give the step
  function fillSeries() {
    if (core.isProtected()) return core.toast("Sheet is protected. Unprotect it to edit.");
    const R = core.range();
    const nums = [];
    for (let r = R.r1; r <= R.r2 && nums.length < 2; r++) {
      const v = core.cellValue(r, R.c1);
      if (typeof v === "number") nums.push(v);
    }
    if (!nums.length) return core.toast("Type a starting number in the top cell first");
    const start = nums[0], step = nums.length > 1 ? nums[1] - nums[0] : 1;
    for (let r = R.r1; r <= R.r2; r++) {
      for (let c = R.c1; c <= R.c2; c++) core.setValue(r, c, String(Number((start + (r - R.r1) * step).toPrecision(12))));
    }
    core.refresh();
    core.toast(`Series filled with step ${step}`);
  }

  function goTo() {
    const d = dialog("Go To",
      `<label>Reference<input id="gtRef" type="text" placeholder="for example C12" /></label>`,
      [{ label: "Cancel" },
        { label: "OK", primary: true, onClick: (el) => {
          const p = parseAddr(el.querySelector("#gtRef").value);
          if (!p || p.r > 1048575 || p.c > 16383) { core.toast("Enter a cell reference such as C12"); return false; }
          core.goTo(p.r, p.c);
        } }]);
    return d;
  }

  // Replaces text in typed values (formulas are left alone)
  function replaceText() {
    const d = dialog("Replace",
      `<label>Find what<input id="rpFind" type="text" /></label>
       <label>Replace with<input id="rpWith" type="text" /></label>`,
      [{ label: "Cancel" },
        { label: "Replace all", primary: true, onClick: (el) => {
          if (core.isProtected()) { core.toast("Sheet is protected. Unprotect it to edit."); return false; }
          const find = el.querySelector("#rpFind").value, rep = el.querySelector("#rpWith").value;
          if (!find) { core.toast("Enter the text to find"); return false; }
          let n = 0;
          for (const k of Array.from(core.cells.keys())) {
            const [r, c] = k.split(",").map(Number);
            const cell = core.getCell(r, c);
            if (!cell || cell.v[0] === "=" || !cell.v.includes(find)) continue;
            core.setValue(r, c, cell.v.split(find).join(rep));
            n++;
          }
          core.refresh();
          core.toast(`Replaced in ${n} cell(s)`);
        } }]);
    return d;
  }

  function homeExtras(cmd, val) {
    switch (cmd) {
      case "fillRight": fillRight(); return true;
      case "series": fillSeries(); return true;
      case "replace": replaceText(); return true;
      case "goto": goTo(); return true;
      default: return false;
    }
  }

  // Activity: the commands run in this session, newest first
  function showActivity() {
    const log = core.activity();
    const body = log.length
      ? `<table class="list">${log.map((e) => `<tr><th>${esc(e.time)}</th><td>${esc(e.cmd)}${e.val !== "" ? " (" + esc(e.val) + ")" : ""}</td></tr>`).join("")}</table>`
      : "<p>No activity yet. Commands you run will appear here.</p>";
    dialog("Activity", body, [{ label: "Close", primary: true }]);
  }

  // Help: topics with search
  const HELP_TOPICS = [
    ["Getting started", "Type in a cell and press Enter to move down, or Tab to move right. Select cells by dragging, or click a column or row heading. Your workbook is saved automatically in this browser."],
    ["Formulas", "Start a formula with =, for example =SUM(A1:A10). Formulas > Insert Function lists functions. Define Name gives a range a name for use in formulas. Manual calculation keeps results until you press Calculate Sheet."],
    ["Data", "Sort with Data > Sort & Filter, and use Custom Sort for two keys. Data Validation limits what can be typed in a cell. Subtotal adds a Total row under each group. Get Data > From Text/CSV loads a CSV file."],
    ["Page layout and printing", "Set paper size, orientation, margins and the print area on the Page Layout tab. File > Print shows a preview. Print sends it to the browser print dialog, where Save as PDF makes a PDF."],
    ["Comments and review", "New Comment adds a note to the active cell. Show Changes highlights the cells that differ from the newest saved version. Version History saves and restores versions."],
    ["Views and zoom", "Zoom changes the size of the sheet. Custom Views keeps a zoom and display setting under a name. Navigation lists names, comments and errors so you can jump to them."],
    ["Drawing", "Draw > Pen, Red Pen and Highlighter mark the sheet. Eraser removes ink and shapes. Draw with Touch lets you draw with a finger or stylus. Ink is kept in this browser."],
    ["Keyboard shortcuts", "Ctrl+C, Ctrl+X and Ctrl+V copy, cut and paste. Ctrl+Z and Ctrl+Y undo and redo. Ctrl+B, Ctrl+I and Ctrl+U bold, italic and underline. Ctrl+D fills down. Ctrl+F finds. Ctrl+S downloads a copy."],
    ["Known limits", "Filter, Group, Freeze Panes and Spelling are not available yet. Charts are previews. Shapes and pictures are not saved with the file."]
  ];

  function openHelp() {
    const d = dialog("Help",
      `<input class="search-in" id="helpSearch" placeholder="Search help" />
       <div class="fn-list" id="helpList">${HELP_TOPICS.map((t, i) => `<button class="fn-item" data-topic="${i}"><b>${esc(t[0])}</b></button>`).join("")}</div>`,
      [{ label: "Close", primary: true }]);
    const list = d.el.querySelector("#helpList");
    d.el.querySelector("#helpSearch").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      list.querySelectorAll("[data-topic]").forEach((b) => {
        const t = HELP_TOPICS[+b.dataset.topic];
        b.style.display = !q || (t[0] + " " + t[1]).toLowerCase().includes(q) ? "" : "none";
      });
    });
    d.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-topic]");
      if (!b) return;
      const t = HELP_TOPICS[+b.dataset.topic];
      d.el.querySelector(".dlg-b").innerHTML = `<h3>${esc(t[0])}</h3><p>${esc(t[1])}</p>` +
        `<p><button class="btn" id="helpBack">Back to topics</button></p>`;
      d.el.querySelector("#helpBack").onclick = () => { d.close(); openHelp(); };
    });
  }

  function reviewViewHelp(cmd, val) {
    switch (cmd) {
      case "showChanges": showChanges(); return true;
      case "version": versionHistory(); return true;
      case "spelling": notAvailable("Spelling", "Spelling needs a dictionary of words. This version does not include one."); return true;
      case "accessibilityCheck": accessibilityCheck(); return true;
      case "pauseProtection": pauseProtection(); return true;
      case "zoom": zoomPrompt(); return true;
      case "zoom100": setZoomPct(100); return true;
      case "zoomSel": setZoomPct(Number(val)); return true;
      case "zoomPct": setZoomPct(Number(val)); return true;
      case "zoomIn": stepZoom(1); return true;
      case "zoomOut": stepZoom(-1); return true;
      case "zoomSelection": zoomToSelection(); return true;
      case "saveView": saveViewPrompt(); return true;
      case "newView": case "newWindow":
        window.open(location.href.split("#")[0], "_blank", "noopener");
        return true;
      case "viewOptions": openBackstage("options"); return true;
      case "sheetViewDefault": applyView(DEFAULT_VIEW); return true;
      case "customViews": customViews(); return true;
      case "navigation": navigation(); return true;
      case "activity": showActivity(); return true;
      case "focusCell": core.sheetOpt.focusCell = !core.sheetOpt.focusCell; core.refresh(); return true;
      case "immersive": immersiveReader(); return true;
      case "freezePanes": case "freezeTop": case "freezeFirst":
        notAvailable("Freeze Panes", "Freeze Panes keeps rows and columns in place while the sheet scrolls. This version does not support frozen panes yet.");
        return true;
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
      case "drawTouch": toggleTouchDraw(); return true;
      case "border": core.applyStyle({ border: val === "none" ? null : true }); return true;
      case "calcBook": core.refresh(); core.toast("All formulas are up to date"); return true;
      case "refreshAll": core.toast("No external data connections in this workbook"); return true;
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
      default: return formulasAndData(cmd, val) || reviewViewHelp(cmd, val) || homeExtras(cmd, val) || applyCore(cmd, val);
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
    $("btnAddSheet").addEventListener("click", () => core.addSheet());
    $("sheetTabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-sheet]");
      if (b) core.switchSheet(+b.dataset.sheet);
    });
    $("sheetTabs").addEventListener("dblclick", (e) => {
      const b = e.target.closest("[data-sheet]");
      if (!b) return;
      const i = +b.dataset.sheet;
      const name = prompt("Sheet name:", core.sheetList()[i].name);
      if (name !== null) core.renameSheet(i, name);
    });
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

    document.addEventListener("keydown", (e) => {
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
      const savedZoom = Number(localStorage.getItem("quadra.zoom"));
      if (savedZoom) { core.setZoom(savedZoom); updateZoomLabel(); }
      const savedTheme = localStorage.getItem(THEME_KEY);
      applyTheme(savedTheme || "light");
      if (accentOverride) setAccent(accentOverride);
      const savedFont = localStorage.getItem(FONT_KEY);
      if (savedFont) core.setDefaultFont(savedFont);
      restoreSession();
      core.onChange(() => { scheduleSave(); updateStatus(); renderSheetTabs(); });
      // do not lose the last change when the page closes before the autosave timer runs
      window.addEventListener("pagehide", () => {
        clearTimeout(saveTimer);
        try { localStorage.setItem(AUTOSAVE_KEY, core.serialize()); } catch (e) { console.error(e); }
      });
      renderSheetTabs(true);
      updateStatus();
      setSaved("Saved");
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === currentTab));
    }
  };
})();
