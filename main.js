/*
 * Copyright (c) 2013 Peter Flynn.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, regexp: true, evil: true */
/*global define, brackets, $, setTimeout, clearTimeout */

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var CommandManager      = brackets.getModule("command/CommandManager"),
        Commands            = brackets.getModule("command/Commands"),
        Menus               = brackets.getModule("command/Menus"),
        StringUtils         = brackets.getModule("utils/StringUtils"),
        EditorManager       = brackets.getModule("editor/EditorManager"),
        LiveDevelopment     = brackets.getModule("LiveDevelopment/LiveDevelopment"),
        Inspector           = brackets.getModule("LiveDevelopment/Inspector/Inspector");
    
    
    // Utilities -----------------------------------------
    
    function charCoords(pos, editor) {
        var result = editor._codeMirror.charCoords(pos);
        if (result.x !== undefined) { // CM v2
            result.left = result.x;
            result.top = result.y;
            result.bottom = result.ybot;
        }
        return result;
    }
    
    
    // Result display ------------------------------------
    
    var $toast;
    var hideToast;
    
    function showPopup(html, editor) {
        // Create result "tooltip" popup
        if (!$toast) {
            // z-index: 18 = @z-index-brackets-max -- CM content goes up to z-index 6 (scrollbars), and we're in the same stacking context; Brackets panels go up to 18 and we might overlap those too
            var css = "style='display: none; position: absolute; opacity: 0.90; padding: 2px 4px; background-color: #ffffff; color: #202020; border: 1px solid #444444; border-radius: 3px; z-index: 18'";
            $toast = $("<div id='eval-in-browser-result' " + css + ">").appendTo($("body"));
        }
        $toast.empty().append(html);
        
        // Show the element
        $toast.stop(true, true); // if already animating away, ff to end of anim so we can re-show
        $toast.show();
        
        // Position toast below code you ran
        // Must happen after show because $.offset() won't work while display:none
        var range = editor.getSelection();
        var endLine = range.end.line;
        var endCh;
        if (range.start.line === endLine) {
            endCh = range.start.ch;
        } else {
            var lineText = editor.document.getLine(endLine);
            endCh = lineText.indexOf(/^\s/);
            if (endCh === -1) { endCh = 0; }
        }
        var anchorPos = charCoords({line: endLine, ch: endCh}, editor);
        $toast.offset({ left: anchorPos.left, top: anchorPos.bottom });
        
        // Set delayed fadeout
        if (hideToast) {
            clearTimeout(hideToast); // make sure we wait a fresh, full second
        }
        hideToast = setTimeout(function () {
            $toast.fadeOut();
        }, 2000);
    }
    
    function presentResult(result, editor) {
        
        function format(offset) {
            var substr = result.substr(offset);
            var codeFontCSS = "line-height: 15px; font-size: 12px; font-family: SourceCodePro";
            return "<span style='" + codeFontCSS + "'>" + StringUtils.htmlEscape(substr) + "</span>";
        }
        
        if (result === "$$undefined") {
            return; // TODO: any feedback?
        }
        var display;
        
        var prefix = result.substr(0, 2);
        if (prefix === "$!") {
            // exception
            display = "<span style='color:red'>Threw " + format(2) + "</span>";
        } else {
            if (prefix === "$$") {
                display = "<span style='color:green'>" + format(2) + "</span>";
            } else if (prefix === "$\"") {
                display = "<span style='color:green'>\"" + format(2) + "\"</span>";
            } else if (prefix === "${") {
                display = "<span>" + format(1) + "</span>";
            } else if (prefix === "$[") {
                display = "<span>" + format(1) + "</span>";
            } else {
                console.error("INTERNAL ERROR: Bad result ", result);
            }
        }
        
        showPopup(display, editor);
    }
    
    
    // Eval engine ---------------------------------------
    
    /**
     * Executed on the browser. Wrapper that formats the user code's result and returns it as a string.
     * (Since generatePreview doesn't seem to work at all).
     * 
     * TODO: this means the user's code can't set globals via 'var foo=...' (must omit 'var')
     */
    function remote_eval(text) {
        var result;
        try {
            result = eval(text);
        } catch (err) {
            return "$!" + err;
        }
        
        var i;
        var str;
        
        switch (typeof result) {
        case "undefined":
        case "number":
        case "boolean":
            return "$$" + result;
        case "string":
            return "$\"" + result;
        case "object":
            if (result === null) {
                return "$$null";
            } else if (Array.isArray(result)) {
                str = "";
                for (i = 0; i < 20 && i < result.length; i++) {
                    if (str) { str += ","; }
                    str += result[i];
                }
                if (i < result.length) {
                    str += "..." + (result.length - i) + " more";
                }
                return "$[" + str + "]";
            } else {
                var keys = Object.keys(result);
                str = "";
                for (i = 0; i < 20 && i < keys.length; i++) {
                    if (str) { str += ","; }
                    str += keys[i] + ":" + result[keys[i]];
                }
                if (i < keys.length) {
                    str += "..." + (keys.length - i) + " more";
                }
                return "${" + str + "}";
            }
            // TODO: special formatting for DOM nodes
        case "function":
            return "$$[function]";
        }
    }
    
    function doEval(text, editor) {
        
        var textStrSafe = text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, "\\\""); // replace \ with \\, newline with \n, " with \"
        var evalStr = remote_eval.toString() + "\n" + "remote_eval(\"" + textStrSafe + "\");";
        console.log("To eval:", evalStr);
        
        function callback(response) {
            var remoteObj = response.result;
            var wasThrown = response.wasThrown;
            
            console.log("RESULT:", response);
            
            if (wasThrown) {
                console.error("INTERNAL ERROR: ", remoteObj);
            } else {
                var result = remoteObj.value;
                console.log(result);
                presentResult(result, editor);
            }
        }
        Inspector.Runtime.evaluate(evalStr, callback);
        
        
        // TODO: ideally, get back a client-formattable result of the raw eval() via generatePreview
        // It seems to get ignored, though...
        
//        function callback(response) {
//            var remoteObj = response.result;
//            var wasThrown = response.wasThrown;
//            
//            var display;
//            if (remoteObj.hasOwnProperty("description")) {
//                display = remoteObj.description;    // object, function
//            } else if (remoteObj.hasOwnProperty("value")) {
//                display = remoteObj.value;      // string, number, boolean
//                if (remoteObj.type === "string") {
//                    display = '"' + display + '"';
//                }
//            } else {
//                display = remoteObj;            // undefined
//            }
//            // TODO: .preview -> Runtime.ObjectPreview
//            
//            if (wasThrown) {
//                console.log("THREW: " + display);
//            } else {
//                console.log("RESULT: " + display);
//            }
//            console.log(remoteObj);
//            console.log(remoteObj.preview);
//        }
//        
//        Inspector.Runtime.evaluate(text, undefined, false, false, undefined, false, true, callback);
//        
//        // Seems simple enough in inspector's ConsoleView.js:
//        // WebInspector.runtimeModel.evaluate(text, "console", useCommandLineAPI, false, false, true, printResult.bind(this));
//        // See also 'RuntimeAgent'
    }
    
    
    function handleEval() {
        if (LiveDevelopment.status === LiveDevelopment.STATUS_ACTIVE || LiveDevelopment.status === LiveDevelopment.STATUS_OUT_OF_SYNC) {
            var editor = EditorManager.getFocusedEditor();
            if (editor) {
                var lang = editor.getLanguageForSelection();
                if (lang.getId() === "javascript") {
                    doEval(editor.getSelectedText(), editor);
                }
            }
        }
    }
    
    // Expose in UI
    var CMD_EVAL = "pflynn.evalinbrowser";
    CommandManager.register("Evaluate JS in Browser", CMD_EVAL, handleEval);
    
    var menu = Menus.getMenu(Menus.AppMenuBar.FILE_MENU);
    menu.addMenuItem(CMD_EVAL, "Ctrl-J", Menus.LAST_IN_SECTION, Menus.MenuSection.FILE_LIVE);
});