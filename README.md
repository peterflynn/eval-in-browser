"Eval in Browser" for Brackets
==============================
Run arbitrary snippets of JS code in your browser with one keystroke:

1. Launch 'Live Preview' to open your page in Chrome
2. Select some JS code
3. Press Ctrl+Shift+J

The code is evaluated as if you'd just typed it into the Developer Tools console. This is often _not the same result_ as if you
save the code and refresh your web page. For example:

* Doesn't update the body of existing functions. E.g. running Eval in Browser on an edited method body will not change what
  happens next time the method is called; it's the same as copy-pasting the method body into the console. However, you can
  overwrite an entire function in the global namespace, and you can eval extra code to explicitly remove & replace event listeners
  that were using the original copy of the function.
* Doesn't change the result of code that's already been run. E.g. changing a global variable that's read by a constructor doesn't
  affect any existing instances of that object. However, re-executing a protype assignment (e.g. `MyClass.prototype.foo = 42;`)
  works well.
* Aways runs in global scope, so vars next to the selected code aren't accessible (unless the selection is also in the global
  scope). Variables and functions inside a module or otherwise nested inside a wrapper function aren't accessible unless they've
  been exported to the global scope.

But when used judiciously, this is a great way to quickly debug or tweak the state of your page without doing a full refresh and
losing the page's current state.


How to Install
==============
Eval in Browser is an extension for [Brackets](https://github.com/adobe/brackets/), a new open-source code editor for the web.

To install extensions:

1. Choose _File > Extension Manager_ and select the _Available_ tab
2. Search for this extension
3. Click _Install_!


### License
MIT-licensed -- see `main.js` for details.

### Compatibility
Brackets Sprint 33 or newer.