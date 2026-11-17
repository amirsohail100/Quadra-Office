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
          sm("orientation", "", "orient", { title: "Orientation" }))),
        stk(sm("wrap", "Wrap Text", "wrap", { tgl: "wrap" }), sm("merge", "Merge & Center", "merge"))),
      grp("Number",
        stk(sel("nf", "numFmt", NUMBER_FORMATS, 118, { title: "Number format" }),
          rw(sm("nf", "", "currency", { val: "currency", title: "Currency" }), sm("nf", "", "percent", { val: "percent", title: "Percent style" }),
            sm("nf", "", "comma", { val: "number", title: "Comma style" }), sm("decUp", "", "decInc", { title: "Increase decimal" }),
            sm("decDown", "", "decDec", { title: "Decrease decimal" })))),
      grp("Styles",
        stk(sm("", "Conditional Formatting", "condFormat", { menu: "condFormat" }), sm("table", "Format as Table", "table"),
          sm("cellStyles", "Cell Styles", "cellStyles"))),
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
        bg("chartScatter", "Scatter", "chartScatter"),
        bg("chart", "Pie", "chartPie", { val: "pie" }),
        bg("chart", "Bar", "chartBar", { val: "bar" }),
        bg("chartStat", "Statistical", "chartStat"),
        bg("chartCombo", "Combo", "chartCombo"),
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
      grp("Themes", bg("", "Themes", "theme", { menu: "themes" }),
        stk(sm("colors", "Colors", "theme"), sm("fonts", "Fonts", "fontColor"), sm("effects", "Effects", "fx"))),
      grp("Page Setup",
        bg("margins", "Margins", "formatCells"), bg("orientation", "Orientation", "orient"), bg("paperSize", "Size", "file"),
        bg("printArea", "Print Area", "formatCells"), bg("breaks", "Breaks", "headings"),
        bg("background", "Background", "pictures"), bg("printTitles", "Print Titles", "headings")),
      grp("Scale to Fit",
        stk(sel("scaleW", null, [["auto", "Width: Automatic"], ["1", "Width: 1 page"]], 150),
          sel("scaleH", null, [["auto", "Height: Automatic"], ["1", "Height: 1 page"]], 150),
          sel("scale", null, [["100", "Scale: 100%"], ["75", "Scale: 75%"], ["50", "Scale: 50%"]], 150))),
      grp("Sheet Options",
        stk(rw(sm("sheetOpt", "Gridlines", "gridlines", { val: "gridView" }), sm("sheetOpt", "Print", "print", { val: "gridPrint" })),
          rw(sm("sheetOpt", "Headings", "headings", { val: "headingsView" }), sm("sheetOpt", "Print", "print", { val: "headingsPrint" })))),
      grp("Arrange", bg("", "Align", "alignMid", { menu: "align" }), bg("arrange", "Group", "outline"), bg("rotate", "Rotate", "orient"))
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
    pivot: [{ label: "PivotTable", cmd: "pivot" }, { label: "Recommended PivotTables", cmd: "recPivot" }],
    forms: [{ label: "Form Control", cmd: "formControl" }],
    pictures: [{ label: "This Device…", cmd: "pictures" }, { label: "Online Pictures", cmd: "onlinePics" }],
    shapes: [{ label: "Rectangle", cmd: "shapes" }, { label: "Oval", cmd: "shapes" }, { label: "Arrow", cmd: "shapes" }],
    chartOther: [{ label: "Histogram", cmd: "chartOther" }, { label: "Box & Whisker", cmd: "chartOther" }, { label: "Treemap", cmd: "chartOther" }],
    align: [{ label: "Align Left", cmd: "ha", val: "left" }, { label: "Align Center", cmd: "ha", val: "center" }, { label: "Align Right", cmd: "ha", val: "right" }],
    insertCells: [{ label: "Insert Sheet Rows", cmd: "insertRows" }, { label: "Insert Sheet Columns", cmd: "insertCols" }],
    deleteCells: [{ label: "Delete Sheet Rows", cmd: "deleteRows" }, { label: "Delete Sheet Columns", cmd: "deleteCols" }],
    condFormat: [
      { label: "Greater Than…", cmd: "cfRule", val: "gt" }, { label: "Less Than…", cmd: "cfRule", val: "lt" },
      { label: "Equal To…", cmd: "cfRule", val: "eq" }, { label: "Between…", cmd: "cfRule", val: "between" },
      { label: "Text Contains…", cmd: "cfRule", val: "contains" }, { sep: true },
      { label: "Clear Rules from Selection", cmd: "cfClear" }
    ],
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

  function chartSvg(type, data) {
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
      main.querySelector("#bsPrint").onclick = () => window.print();
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
    core.setPalette(THEMES[t]);
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
      case "printBook": window.print(); return true;
      case "renameBook": renameBook(); return true;
      case "editingMode": case "viewingMode": case "reviewingMode":
        core.toast("Editing mode is always on in this version"); return true;
      case "themeOffice": core.toast("Office theme is active"); return true;
      case "insertRows": core.editLines("row", false); return true;
      case "insertCols": core.editLines("col", false); return true;
      case "deleteRows": core.editLines("row", true); return true;
      case "deleteCols": core.editLines("col", true); return true;
      case "cfRule": addRuleFromPrompt(val); return true;
      case "cfClear": core.clearRules(); return true;
      default: return false;
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
      restoreSession();
      core.onChange(() => { scheduleSave(); updateStatus(); });
      updateStatus();
      setSaved("Saved");
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === currentTab));
    }
  };
})();
