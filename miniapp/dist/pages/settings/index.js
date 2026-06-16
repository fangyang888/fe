"use strict";
(wx["webpackJsonp"] = wx["webpackJsonp"] || []).push([["pages/settings/index"],{

/***/ "./node_modules/.pnpm/babel-loader@8.2.1_zf4wsaptjk7lcn3cniwuuw3ypq/node_modules/babel-loader/lib/index.js??ruleSet[1].rules[5].use[0]!./src/pages/settings/index.tsx":
/*!****************************************************************************************************************************************************************************!*\
  !*** ./node_modules/.pnpm/babel-loader@8.2.1_zf4wsaptjk7lcn3cniwuuw3ypq/node_modules/babel-loader/lib/index.js??ruleSet[1].rules[5].use[0]!./src/pages/settings/index.tsx ***!
  \****************************************************************************************************************************************************************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": function() { return /* binding */ Settings; }
/* harmony export */ });
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/regenerator.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/regenerator.js");
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js");
/* harmony import */ var _tarojs_components__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! @tarojs/components */ "./node_modules/.pnpm/@tarojs+plugin-platform-weapp@3.6.6_@types+react@18.3.27/node_modules/@tarojs/plugin-platform-weapp/dist/components-react.js");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @tarojs/taro */ "webpack/container/remote/@tarojs/taro");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_tarojs_taro__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _store_userStore__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../store/userStore */ "./src/store/userStore.ts");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! react/jsx-runtime */ "webpack/container/remote/react/jsx-runtime");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__);







function Settings() {
  var handleLogout = /*#__PURE__*/function () {
    var _ref = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_3__["default"])(/*#__PURE__*/(0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_4__["default"])().m(function _callee() {
      var res;
      return (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_4__["default"])().w(function (_context) {
        while (1) switch (_context.n) {
          case 0:
            _context.n = 1;
            return _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showModal({
              title: '提示',
              content: '确定退出登录?'
            });
          case 1:
            res = _context.v;
            if (res.confirm) {
              _context.n = 2;
              break;
            }
            return _context.a(2);
          case 2:
            (0,_store_userStore__WEBPACK_IMPORTED_MODULE_1__.logout)();
            // 退出后重新静默登录（dev 环境会回到 dev 用户），并返回上一页
            _context.n = 3;
            return (0,_store_userStore__WEBPACK_IMPORTED_MODULE_1__.login)();
          case 3:
            _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showToast({
              title: '已退出',
              icon: 'success'
            });
            setTimeout(function () {
              return _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().navigateBack();
            }, 600);
          case 4:
            return _context.a(2);
        }
      }, _callee);
    }));
    return function handleLogout() {
      return _ref.apply(this, arguments);
    };
  }();
  var clearCache = /*#__PURE__*/function () {
    var _ref2 = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_3__["default"])(/*#__PURE__*/(0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_4__["default"])().m(function _callee2() {
      var res;
      return (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_4__["default"])().w(function (_context2) {
        while (1) switch (_context2.n) {
          case 0:
            _context2.n = 1;
            return _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showModal({
              title: '提示',
              content: '清除本地缓存?'
            });
          case 1:
            res = _context2.v;
            if (res.confirm) {
              _context2.n = 2;
              break;
            }
            return _context2.a(2);
          case 2:
            try {
              _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().clearStorageSync();
            } catch (_unused) {
              // ignore
            }
            _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showToast({
              title: '已清除',
              icon: 'success'
            });
          case 3:
            return _context2.a(2);
        }
      }, _callee2);
    }));
    return function clearCache() {
      return _ref2.apply(this, arguments);
    };
  }();
  var showAbout = function showAbout() {
    _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showModal({
      title: '关于',
      content: '商城小程序 v1.0.0\n基于 Taro + NestJS',
      showCancel: false
    });
  };
  return /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_5__.View, {
    className: "settings-page",
    children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_5__.View, {
      className: "group",
      children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_5__.View, {
        className: "cell",
        onClick: clearCache,
        children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_5__.Text, {
          className: "cell-text",
          children: "\u6E05\u9664\u7F13\u5B58"
        }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_5__.Text, {
          className: "cell-arrow",
          children: "\u203A"
        })]
      }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_5__.View, {
        className: "cell",
        onClick: showAbout,
        children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_5__.Text, {
          className: "cell-text",
          children: "\u5173\u4E8E\u6211\u4EEC"
        }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_5__.Text, {
          className: "cell-arrow",
          children: "\u203A"
        })]
      })]
    }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_5__.View, {
      className: "logout-btn",
      onClick: handleLogout,
      children: /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_2__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_5__.Text, {
        className: "logout-text",
        children: "\u9000\u51FA\u767B\u5F55"
      })
    })]
  });
}

/***/ }),

/***/ "./src/pages/settings/index.tsx":
/*!**************************************!*\
  !*** ./src/pages/settings/index.tsx ***!
  \**************************************/
/***/ (function(__unused_webpack_module, __unused_webpack___webpack_exports__, __webpack_require__) {

/* harmony import */ var _tarojs_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @tarojs/runtime */ "webpack/container/remote/@tarojs/runtime");
/* harmony import */ var _tarojs_runtime__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_tarojs_runtime__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_pnpm_babel_loader_8_2_1_zf4wsaptjk7lcn3cniwuuw3ypq_node_modules_babel_loader_lib_index_js_ruleSet_1_rules_5_use_0_index_tsx__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../node_modules/.pnpm/babel-loader@8.2.1_zf4wsaptjk7lcn3cniwuuw3ypq/node_modules/babel-loader/lib/index.js??ruleSet[1].rules[5].use[0]!./index.tsx */ "./node_modules/.pnpm/babel-loader@8.2.1_zf4wsaptjk7lcn3cniwuuw3ypq/node_modules/babel-loader/lib/index.js??ruleSet[1].rules[5].use[0]!./src/pages/settings/index.tsx");


var config = {"navigationBarTitleText":"设置"};


var inst = Page((0,_tarojs_runtime__WEBPACK_IMPORTED_MODULE_0__.createPageConfig)(_node_modules_pnpm_babel_loader_8_2_1_zf4wsaptjk7lcn3cniwuuw3ypq_node_modules_babel_loader_lib_index_js_ruleSet_1_rules_5_use_0_index_tsx__WEBPACK_IMPORTED_MODULE_1__["default"], 'pages/settings/index', {root:{cn:[]}}, config || {}))


/* unused harmony default export */ var __WEBPACK_DEFAULT_EXPORT__ = (_node_modules_pnpm_babel_loader_8_2_1_zf4wsaptjk7lcn3cniwuuw3ypq_node_modules_babel_loader_lib_index_js_ruleSet_1_rules_5_use_0_index_tsx__WEBPACK_IMPORTED_MODULE_1__["default"]);


/***/ })

},
/******/ function(__webpack_require__) { // webpackRuntimeModules
/******/ var __webpack_exec__ = function(moduleId) { return __webpack_require__(__webpack_require__.s = moduleId); }
/******/ __webpack_require__.O(0, ["taro","vendors","common"], function() { return __webpack_exec__("./src/pages/settings/index.tsx"); });
/******/ var __webpack_exports__ = __webpack_require__.O();
/******/ }
]);
//# sourceMappingURL=index.js.map