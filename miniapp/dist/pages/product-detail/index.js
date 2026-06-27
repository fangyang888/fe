"use strict";
(wx["webpackJsonp"] = wx["webpackJsonp"] || []).push([["pages/product-detail/index"],{

/***/ "./node_modules/.pnpm/babel-loader@8.2.1_zf4wsaptjk7lcn3cniwuuw3ypq/node_modules/babel-loader/lib/index.js??ruleSet[1].rules[5].use[0]!./src/pages/product-detail/index.tsx":
/*!**********************************************************************************************************************************************************************************!*\
  !*** ./node_modules/.pnpm/babel-loader@8.2.1_zf4wsaptjk7lcn3cniwuuw3ypq/node_modules/babel-loader/lib/index.js??ruleSet[1].rules[5].use[0]!./src/pages/product-detail/index.tsx ***!
  \**********************************************************************************************************************************************************************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": function() { return /* binding */ ProductDetail; }
/* harmony export */ });
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_9__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/regenerator.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/regenerator.js");
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_8__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js");
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_slicedToArray_js__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/slicedToArray.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/slicedToArray.js");
/* harmony import */ var _tarojs_components__WEBPACK_IMPORTED_MODULE_10__ = __webpack_require__(/*! @tarojs/components */ "./node_modules/.pnpm/@tarojs+plugin-platform-weapp@3.6.6_@types+react@18.3.27/node_modules/@tarojs/plugin-platform-weapp/dist/components-react.js");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @tarojs/taro */ "webpack/container/remote/@tarojs/taro");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_tarojs_taro__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! react */ "webpack/container/remote/react");
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _api_home__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../api/home */ "./src/api/home.ts");
/* harmony import */ var _api_favorite__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../../api/favorite */ "./src/api/favorite.ts");
/* harmony import */ var _store_cartStore__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../../store/cartStore */ "./src/store/cartStore.ts");
/* harmony import */ var _utils_tracker__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../../utils/tracker */ "./src/utils/tracker.ts");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! react/jsx-runtime */ "webpack/container/remote/react/jsx-runtime");
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6___default = /*#__PURE__*/__webpack_require__.n(react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__);












function ProductDetail() {
  var _product$stock;
  var router = (0,_tarojs_taro__WEBPACK_IMPORTED_MODULE_0__.useRouter)();
  var _useState = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(null),
    _useState2 = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_slicedToArray_js__WEBPACK_IMPORTED_MODULE_7__["default"])(_useState, 2),
    product = _useState2[0],
    setProduct = _useState2[1];
  var _useState3 = (0,react__WEBPACK_IMPORTED_MODULE_1__.useState)(false),
    _useState4 = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_slicedToArray_js__WEBPACK_IMPORTED_MODULE_7__["default"])(_useState3, 2),
    faved = _useState4[0],
    setFaved = _useState4[1];
  (0,_tarojs_taro__WEBPACK_IMPORTED_MODULE_0__.useLoad)(function () {
    var id = Number(router.params.id);
    if (!id) return;
    (0,_utils_tracker__WEBPACK_IMPORTED_MODULE_5__.track)('product_detail_view', {
      productId: id
    }, 'pageview');
    (0,_api_home__WEBPACK_IMPORTED_MODULE_2__.apiGetProduct)(id).then(setProduct).catch(function () {});
    (0,_api_favorite__WEBPACK_IMPORTED_MODULE_3__.apiCheckFavorite)(id).then(function (r) {
      return setFaved(r.favorite);
    }).catch(function () {});
  });
  var toggleFav = /*#__PURE__*/function () {
    var _ref = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_8__["default"])(/*#__PURE__*/(0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_9__["default"])().m(function _callee() {
      return (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_9__["default"])().w(function (_context) {
        while (1) switch (_context.n) {
          case 0:
            if (product) {
              _context.n = 1;
              break;
            }
            return _context.a(2);
          case 1:
            if (!faved) {
              _context.n = 3;
              break;
            }
            _context.n = 2;
            return (0,_api_favorite__WEBPACK_IMPORTED_MODULE_3__.apiRemoveFavorite)(product.id);
          case 2:
            setFaved(false);
            (0,_utils_tracker__WEBPACK_IMPORTED_MODULE_5__.track)('favorite_remove', {
              productId: product.id
            });
            _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showToast({
              title: '已取消收藏',
              icon: 'none'
            });
            _context.n = 5;
            break;
          case 3:
            _context.n = 4;
            return (0,_api_favorite__WEBPACK_IMPORTED_MODULE_3__.apiAddFavorite)(product.id);
          case 4:
            setFaved(true);
            (0,_utils_tracker__WEBPACK_IMPORTED_MODULE_5__.track)('favorite_add', {
              productId: product.id
            });
            _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showToast({
              title: '已收藏',
              icon: 'success'
            });
          case 5:
            return _context.a(2);
        }
      }, _callee);
    }));
    return function toggleFav() {
      return _ref.apply(this, arguments);
    };
  }();
  var addCart = /*#__PURE__*/function () {
    var _ref2 = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_8__["default"])(/*#__PURE__*/(0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_9__["default"])().m(function _callee2() {
      return (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_9__["default"])().w(function (_context2) {
        while (1) switch (_context2.n) {
          case 0:
            if (product) {
              _context2.n = 1;
              break;
            }
            return _context2.a(2);
          case 1:
            _context2.n = 2;
            return (0,_store_cartStore__WEBPACK_IMPORTED_MODULE_4__.addToCart)(product.id);
          case 2:
            return _context2.a(2);
        }
      }, _callee2);
    }));
    return function addCart() {
      return _ref2.apply(this, arguments);
    };
  }();
  var goCart = function goCart() {
    _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().switchTab({
      url: '/pages/cart/index'
    });
  };
  if (!product) {
    return /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.View, {
      className: "product-detail-page",
      children: /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.View, {
        className: "loading",
        children: "\u52A0\u8F7D\u4E2D..."
      })
    });
  }
  return /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.View, {
    className: "product-detail-page",
    children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Image, {
      className: "main-image",
      src: product.image || '',
      mode: "aspectFill"
    }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.View, {
      className: "info-card",
      children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.View, {
        className: "price-row",
        children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Text, {
          className: "price",
          children: ["\xA5", product.price]
        }), product.originalPrice ? /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Text, {
          className: "original",
          children: ["\xA5", product.originalPrice]
        }) : null]
      }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Text, {
        className: "name",
        children: product.name
      }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.View, {
        className: "meta-row",
        children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Text, {
          className: "meta",
          children: ["\u5DF2\u552E ", product.sales]
        }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Text, {
          className: "meta",
          children: ["\u5E93\u5B58 ", (_product$stock = product.stock) !== null && _product$stock !== void 0 ? _product$stock : '充足']
        })]
      })]
    }), product.description ? /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.View, {
      className: "desc-card",
      children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Text, {
        className: "desc-title",
        children: "\u5546\u54C1\u8BE6\u60C5"
      }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Text, {
        className: "desc-text",
        children: product.description
      })]
    }) : null, /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.View, {
      className: "action-bar",
      children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.View, {
        className: "icon-btn",
        onClick: toggleFav,
        children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Text, {
          className: "icon",
          children: faved ? '❤️' : '🤍'
        }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Text, {
          className: "icon-label",
          children: "\u6536\u85CF"
        })]
      }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsxs)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.View, {
        className: "icon-btn",
        onClick: goCart,
        children: [/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Text, {
          className: "icon",
          children: "\uD83D\uDED2"
        }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Text, {
          className: "icon-label",
          children: "\u8D2D\u7269\u8F66"
        })]
      }), /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.View, {
        className: "add-cart-btn",
        onClick: addCart,
        children: /*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(_tarojs_components__WEBPACK_IMPORTED_MODULE_10__.Text, {
          className: "add-cart-text",
          children: "\u52A0\u5165\u8D2D\u7269\u8F66"
        })
      })]
    })]
  });
}

/***/ }),

/***/ "./src/pages/product-detail/index.tsx":
/*!********************************************!*\
  !*** ./src/pages/product-detail/index.tsx ***!
  \********************************************/
/***/ (function(__unused_webpack_module, __unused_webpack___webpack_exports__, __webpack_require__) {

/* harmony import */ var _tarojs_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @tarojs/runtime */ "webpack/container/remote/@tarojs/runtime");
/* harmony import */ var _tarojs_runtime__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_tarojs_runtime__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_pnpm_babel_loader_8_2_1_zf4wsaptjk7lcn3cniwuuw3ypq_node_modules_babel_loader_lib_index_js_ruleSet_1_rules_5_use_0_index_tsx__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../node_modules/.pnpm/babel-loader@8.2.1_zf4wsaptjk7lcn3cniwuuw3ypq/node_modules/babel-loader/lib/index.js??ruleSet[1].rules[5].use[0]!./index.tsx */ "./node_modules/.pnpm/babel-loader@8.2.1_zf4wsaptjk7lcn3cniwuuw3ypq/node_modules/babel-loader/lib/index.js??ruleSet[1].rules[5].use[0]!./src/pages/product-detail/index.tsx");


var config = {"navigationBarTitleText":"商品详情"};


var inst = Page((0,_tarojs_runtime__WEBPACK_IMPORTED_MODULE_0__.createPageConfig)(_node_modules_pnpm_babel_loader_8_2_1_zf4wsaptjk7lcn3cniwuuw3ypq_node_modules_babel_loader_lib_index_js_ruleSet_1_rules_5_use_0_index_tsx__WEBPACK_IMPORTED_MODULE_1__["default"], 'pages/product-detail/index', {root:{cn:[]}}, config || {}))


/* unused harmony default export */ var __WEBPACK_DEFAULT_EXPORT__ = (_node_modules_pnpm_babel_loader_8_2_1_zf4wsaptjk7lcn3cniwuuw3ypq_node_modules_babel_loader_lib_index_js_ruleSet_1_rules_5_use_0_index_tsx__WEBPACK_IMPORTED_MODULE_1__["default"]);


/***/ })

},
/******/ function(__webpack_require__) { // webpackRuntimeModules
/******/ var __webpack_exec__ = function(moduleId) { return __webpack_require__(__webpack_require__.s = moduleId); }
/******/ __webpack_require__.O(0, ["taro","vendors","common"], function() { return __webpack_exec__("./src/pages/product-detail/index.tsx"); });
/******/ var __webpack_exports__ = __webpack_require__.O();
/******/ }
]);
//# sourceMappingURL=index.js.map