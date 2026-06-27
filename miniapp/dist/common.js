"use strict";
(wx["webpackJsonp"] = wx["webpackJsonp"] || []).push([["common"],{

/***/ "./src/api/address.ts":
/*!****************************!*\
  !*** ./src/api/address.ts ***!
  \****************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "apiCreateAddress": function() { return /* binding */ apiCreateAddress; },
/* harmony export */   "apiGetAddresses": function() { return /* binding */ apiGetAddresses; },
/* harmony export */   "apiRemoveAddress": function() { return /* binding */ apiRemoveAddress; },
/* harmony export */   "apiSetDefaultAddress": function() { return /* binding */ apiSetDefaultAddress; },
/* harmony export */   "apiUpdateAddress": function() { return /* binding */ apiUpdateAddress; }
/* harmony export */ });
/* harmony import */ var _utils_request__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/request */ "./src/utils/request.ts");

var apiGetAddresses = function apiGetAddresses() {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.get('/api/address');
};
var apiCreateAddress = function apiCreateAddress(data) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.post('/api/address', data);
};
var apiUpdateAddress = function apiUpdateAddress(id, data) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.put("/api/address/".concat(id), data);
};
var apiSetDefaultAddress = function apiSetDefaultAddress(id) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.put("/api/address/".concat(id, "/default"));
};
var apiRemoveAddress = function apiRemoveAddress(id) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http["delete"]("/api/address/".concat(id));
};

/***/ }),

/***/ "./src/api/cart.ts":
/*!*************************!*\
  !*** ./src/api/cart.ts ***!
  \*************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "apiAddCart": function() { return /* binding */ apiAddCart; },
/* harmony export */   "apiClearCart": function() { return /* binding */ apiClearCart; },
/* harmony export */   "apiGetCart": function() { return /* binding */ apiGetCart; },
/* harmony export */   "apiRemoveCartItem": function() { return /* binding */ apiRemoveCartItem; },
/* harmony export */   "apiSetCartChecked": function() { return /* binding */ apiSetCartChecked; },
/* harmony export */   "apiUpdateCartQty": function() { return /* binding */ apiUpdateCartQty; }
/* harmony export */ });
/* harmony import */ var _utils_request__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/request */ "./src/utils/request.ts");

/** 获取购物车 */
var apiGetCart = function apiGetCart() {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.get('/api/cart');
};

/** 加入购物车 */
var apiAddCart = function apiAddCart(productId) {
  var quantity = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.post('/api/cart', {
    productId: productId,
    quantity: quantity
  });
};

/** 改数量（0 则删除） */
var apiUpdateCartQty = function apiUpdateCartQty(id, quantity) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.put("/api/cart/".concat(id), {
    quantity: quantity
  });
};

/** 勾选/取消 */
var apiSetCartChecked = function apiSetCartChecked(id, checked) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.put("/api/cart/".concat(id, "/checked"), {
    checked: checked
  });
};

/** 删除单项 */
var apiRemoveCartItem = function apiRemoveCartItem(id) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http["delete"]("/api/cart/".concat(id));
};

/** 清空 */
var apiClearCart = function apiClearCart() {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http["delete"]('/api/cart');
};

/***/ }),

/***/ "./src/api/favorite.ts":
/*!*****************************!*\
  !*** ./src/api/favorite.ts ***!
  \*****************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "apiAddFavorite": function() { return /* binding */ apiAddFavorite; },
/* harmony export */   "apiCheckFavorite": function() { return /* binding */ apiCheckFavorite; },
/* harmony export */   "apiGetFavorites": function() { return /* binding */ apiGetFavorites; },
/* harmony export */   "apiRemoveFavorite": function() { return /* binding */ apiRemoveFavorite; }
/* harmony export */ });
/* harmony import */ var _utils_request__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/request */ "./src/utils/request.ts");

/** 我的收藏 */
var apiGetFavorites = function apiGetFavorites() {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.get('/api/favorite');
};

/** 是否已收藏 */
var apiCheckFavorite = function apiCheckFavorite(productId) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.get("/api/favorite/check/".concat(productId));
};

/** 添加收藏 */
var apiAddFavorite = function apiAddFavorite(productId) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.post('/api/favorite', {
    productId: productId
  });
};

/** 取消收藏 */
var apiRemoveFavorite = function apiRemoveFavorite(productId) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http["delete"]("/api/favorite/".concat(productId));
};

/***/ }),

/***/ "./src/api/home.ts":
/*!*************************!*\
  !*** ./src/api/home.ts ***!
  \*************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "apiGetHome": function() { return /* binding */ apiGetHome; },
/* harmony export */   "apiGetProduct": function() { return /* binding */ apiGetProduct; }
/* harmony export */ });
/* unused harmony export apiGetProducts */
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_slicedToArray_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/slicedToArray.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/slicedToArray.js");
/* harmony import */ var _utils_request__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/request */ "./src/utils/request.ts");
/* provided dependency */ var URLSearchParams = __webpack_require__(/*! @tarojs/runtime */ "webpack/container/remote/@tarojs/runtime")["URLSearchParams"];


/** 首页聚合数据 */
var apiGetHome = function apiGetHome() {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.get('/api/home', {
    auth: false
  });
};
/** 商品列表 */
var apiGetProducts = function apiGetProducts(params) {
  var qs = new URLSearchParams(Object.entries(params || {}).reduce(function (acc, _ref) {
    var _ref2 = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_slicedToArray_js__WEBPACK_IMPORTED_MODULE_1__["default"])(_ref, 2),
      k = _ref2[0],
      v = _ref2[1];
    if (v !== undefined && v !== null) acc[k] = String(v);
    return acc;
  }, {})).toString();
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.get("/api/product".concat(qs ? "?".concat(qs) : ''), {
    auth: false
  });
};

/** 商品详情 */
var apiGetProduct = function apiGetProduct(id) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.get("/api/product/".concat(id), {
    auth: false
  });
};

/***/ }),

/***/ "./src/api/order.ts":
/*!**************************!*\
  !*** ./src/api/order.ts ***!
  \**************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "apiCreateOrder": function() { return /* binding */ apiCreateOrder; },
/* harmony export */   "apiGetOrder": function() { return /* binding */ apiGetOrder; },
/* harmony export */   "apiGetOrderSummary": function() { return /* binding */ apiGetOrderSummary; },
/* harmony export */   "apiGetOrders": function() { return /* binding */ apiGetOrders; },
/* harmony export */   "apiPayOrder": function() { return /* binding */ apiPayOrder; },
/* harmony export */   "apiUpdateOrderStatus": function() { return /* binding */ apiUpdateOrderStatus; }
/* harmony export */ });
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_slicedToArray_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/slicedToArray.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/slicedToArray.js");
/* harmony import */ var _utils_request__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/request */ "./src/utils/request.ts");
/* provided dependency */ var URLSearchParams = __webpack_require__(/*! @tarojs/runtime */ "webpack/container/remote/@tarojs/runtime")["URLSearchParams"];


/** 各状态订单数量（我的页角标） */
var apiGetOrderSummary = function apiGetOrderSummary() {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.get('/api/order/summary');
};

/** 订单列表 */
var apiGetOrders = function apiGetOrders(params) {
  var qs = new URLSearchParams(Object.entries(params || {}).reduce(function (acc, _ref) {
    var _ref2 = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_slicedToArray_js__WEBPACK_IMPORTED_MODULE_1__["default"])(_ref, 2),
      k = _ref2[0],
      v = _ref2[1];
    if (v !== undefined && v !== null) acc[k] = String(v);
    return acc;
  }, {})).toString();
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.get("/api/order".concat(qs ? "?".concat(qs) : ''));
};

/** 订单详情 */
var apiGetOrder = function apiGetOrder(id) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.get("/api/order/".concat(id));
};

/** 用购物车勾选项下单 */
var apiCreateOrder = function apiCreateOrder(data) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.post('/api/order', data || {});
};

/** 修改订单状态（付款/取消/确认收货等） */
var apiUpdateOrderStatus = function apiUpdateOrderStatus(id, status) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.put("/api/order/".concat(id, "/status"), {
    status: status
  });
};

/** wx.requestPayment 所需参数（后端微信下单返回） */

/** 发起微信支付，获取调起参数 */
var apiPayOrder = function apiPayOrder(id) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.post("/api/order/".concat(id, "/pay"));
};

/***/ }),

/***/ "./src/api/track.ts":
/*!**************************!*\
  !*** ./src/api/track.ts ***!
  \**************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "reportEvents": function() { return /* binding */ reportEvents; }
/* harmony export */ });
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @tarojs/taro */ "webpack/container/remote/@tarojs/taro");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_tarojs_taro__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _config__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../config */ "./src/config/index.ts");


/**
 * 埋点上报：独立于业务 request 封装，绝不弹错、绝不阻塞主流程。
 * 不带鉴权（未登录也采集）。
 */
function reportEvents(events) {
  return new Promise(function (resolve) {
    _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().request({
      url: "".concat(_config__WEBPACK_IMPORTED_MODULE_1__.BASE_URL, "/api/track/report"),
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        events: events
      },
      success: function success() {
        return resolve();
      },
      fail: function fail() {
        return resolve();
      } // 静默失败
    });
  });
}

/***/ }),

/***/ "./src/api/user.ts":
/*!*************************!*\
  !*** ./src/api/user.ts ***!
  \*************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "apiGetProfile": function() { return /* binding */ apiGetProfile; },
/* harmony export */   "apiLogin": function() { return /* binding */ apiLogin; },
/* harmony export */   "apiUpdateProfile": function() { return /* binding */ apiUpdateProfile; }
/* harmony export */ });
/* unused harmony export apiBindPhone */
/* harmony import */ var _utils_request__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/request */ "./src/utils/request.ts");

/** 小程序登录：用 wx.login 的 code 换 token */
var apiLogin = function apiLogin(code) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.post('/api/auth/login', {
    code: code
  }, {
    auth: false
  });
};

/** 获取当前登录用户信息 */
var apiGetProfile = function apiGetProfile() {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.get('/api/user/profile');
};

/** 更新昵称/头像/性别 */
var apiUpdateProfile = function apiUpdateProfile(data) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.put('/api/user/profile', data);
};

/** 绑定手机号 */
var apiBindPhone = function apiBindPhone(code) {
  return _utils_request__WEBPACK_IMPORTED_MODULE_0__.http.post('/api/auth/phone', {
    code: code
  });
};

/***/ }),

/***/ "./src/config/index.ts":
/*!*****************************!*\
  !*** ./src/config/index.ts ***!
  \*****************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "BASE_URL": function() { return /* binding */ BASE_URL; },
/* harmony export */   "STORAGE_KEYS": function() { return /* binding */ STORAGE_KEYS; }
/* harmony export */ });
/**
 * 前端运行时配置。根据编译环境切换 API 地址。
 * Taro 用 process.env.NODE_ENV 区分 dev / production。
 */
var ENV = "development";
var config = {
  development: {
    // 微信开发者工具里需在「详情-本地设置」勾选「不校验合法域名」才能连 localhost
    baseUrl: 'http://127.0.0.1:3000'
  },
  production: {
    baseUrl: 'http://47.106.103.79' // TODO: 换成线上后端地址
  }
};
var BASE_URL = ENV === 'production' ? config.production.baseUrl : config.development.baseUrl;

/** 本地缓存 key */
var STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER_INFO: 'user_info'
};

/***/ }),

/***/ "./src/store/cartStore.ts":
/*!********************************!*\
  !*** ./src/store/cartStore.ts ***!
  \********************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "addToCart": function() { return /* binding */ addToCart; },
/* harmony export */   "getCart": function() { return /* binding */ getCart; },
/* harmony export */   "getCartCount": function() { return /* binding */ getCartCount; },
/* harmony export */   "removeFromCart": function() { return /* binding */ removeFromCart; },
/* harmony export */   "setAllChecked": function() { return /* binding */ setAllChecked; },
/* harmony export */   "setItemChecked": function() { return /* binding */ setItemChecked; },
/* harmony export */   "updateQuantity": function() { return /* binding */ updateQuantity; }
/* harmony export */ });
/* unused harmony export clearCart */
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/regenerator.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/regenerator.js");
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @tarojs/taro */ "webpack/container/remote/@tarojs/taro");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_tarojs_taro__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _api_cart__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../api/cart */ "./src/api/cart.ts");




/** 获取购物车（含合计） */
var getCart = function getCart() {
  return (0,_api_cart__WEBPACK_IMPORTED_MODULE_1__.apiGetCart)();
};

/** 购物车商品数量（角标用） */
var getCartCount = /*#__PURE__*/function () {
  var _ref = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_2__["default"])(/*#__PURE__*/(0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_3__["default"])().m(function _callee() {
    var _yield$apiGetCart, totalQuantity, _t;
    return (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_3__["default"])().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          _context.p = 0;
          _context.n = 1;
          return (0,_api_cart__WEBPACK_IMPORTED_MODULE_1__.apiGetCart)();
        case 1:
          _yield$apiGetCart = _context.v;
          totalQuantity = _yield$apiGetCart.totalQuantity;
          return _context.a(2, totalQuantity);
        case 2:
          _context.p = 2;
          _t = _context.v;
          return _context.a(2, 0);
      }
    }, _callee, null, [[0, 2]]);
  }));
  return function getCartCount() {
    return _ref.apply(this, arguments);
  };
}();

/** 加入购物车 */
var addToCart = /*#__PURE__*/function () {
  var _ref2 = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_2__["default"])(/*#__PURE__*/(0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_3__["default"])().m(function _callee2(productId) {
    var quantity,
      data,
      _args2 = arguments;
    return (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_3__["default"])().w(function (_context2) {
      while (1) switch (_context2.n) {
        case 0:
          quantity = _args2.length > 1 && _args2[1] !== undefined ? _args2[1] : 1;
          _context2.n = 1;
          return (0,_api_cart__WEBPACK_IMPORTED_MODULE_1__.apiAddCart)(productId, quantity);
        case 1:
          data = _context2.v;
          _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showToast({
            title: '已加入购物车',
            icon: 'success'
          });
          return _context2.a(2, data);
      }
    }, _callee2);
  }));
  return function addToCart(_x) {
    return _ref2.apply(this, arguments);
  };
}();

/** 改数量（<=0 删除） */
var updateQuantity = function updateQuantity(id, quantity) {
  return (0,_api_cart__WEBPACK_IMPORTED_MODULE_1__.apiUpdateCartQty)(id, quantity);
};

/** 勾选/取消单项 */
var setItemChecked = function setItemChecked(id, checked) {
  return (0,_api_cart__WEBPACK_IMPORTED_MODULE_1__.apiSetCartChecked)(id, checked);
};

/** 全选/全不选（逐项设置） */
var setAllChecked = /*#__PURE__*/function () {
  var _ref3 = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_2__["default"])(/*#__PURE__*/(0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_3__["default"])().m(function _callee3(items, checked) {
    return (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_3__["default"])().w(function (_context3) {
      while (1) switch (_context3.n) {
        case 0:
          _context3.n = 1;
          return Promise.all(items.filter(function (i) {
            return i.checked !== checked;
          }).map(function (i) {
            return (0,_api_cart__WEBPACK_IMPORTED_MODULE_1__.apiSetCartChecked)(i.id, checked);
          }));
        case 1:
          return _context3.a(2);
      }
    }, _callee3);
  }));
  return function setAllChecked(_x2, _x3) {
    return _ref3.apply(this, arguments);
  };
}();

/** 删除单项 */
var removeFromCart = function removeFromCart(id) {
  return (0,_api_cart__WEBPACK_IMPORTED_MODULE_1__.apiRemoveCartItem)(id);
};

/** 清空 */
var clearCart = function clearCart() {
  return (0,_api_cart__WEBPACK_IMPORTED_MODULE_1__.apiClearCart)();
};

/***/ }),

/***/ "./src/store/userStore.ts":
/*!********************************!*\
  !*** ./src/store/userStore.ts ***!
  \********************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "getUserInfo": function() { return /* binding */ getUserInfo; },
/* harmony export */   "isLoggedIn": function() { return /* binding */ isLoggedIn; },
/* harmony export */   "login": function() { return /* binding */ login; },
/* harmony export */   "logout": function() { return /* binding */ logout; },
/* harmony export */   "refreshUserInfo": function() { return /* binding */ refreshUserInfo; }
/* harmony export */ });
/* unused harmony exports getToken, hasRole, isAdmin */
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/regenerator.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/regenerator.js");
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @tarojs/taro */ "webpack/container/remote/@tarojs/taro");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_tarojs_taro__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _config__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../config */ "./src/config/index.ts");
/* harmony import */ var _api_user__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../api/user */ "./src/api/user.ts");






/** 读取本地缓存的用户信息 */
var getUserInfo = function getUserInfo() {
  try {
    var data = _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().getStorageSync(_config__WEBPACK_IMPORTED_MODULE_1__.STORAGE_KEYS.USER_INFO);
    return data ? JSON.parse(data) : null;
  } catch (_unused) {
    return null;
  }
};
var saveUserInfo = function saveUserInfo(user) {
  _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().setStorageSync(_config__WEBPACK_IMPORTED_MODULE_1__.STORAGE_KEYS.USER_INFO, JSON.stringify(user));
};
var getToken = function getToken() {
  return _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().getStorageSync(_config__WEBPACK_IMPORTED_MODULE_1__.STORAGE_KEYS.TOKEN) || '';
};
var isLoggedIn = function isLoggedIn() {
  return !!getToken();
};

/**
 * 静默登录：wx.login 拿 code → 换 token → 存储。
 * App 启动时调用，保证后续请求有 token。
 */
var login = /*#__PURE__*/function () {
  var _ref = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_3__["default"])(/*#__PURE__*/(0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_4__["default"])().m(function _callee() {
    var _yield$Taro$login, code, _yield$apiLogin, token, userInfo, _t;
    return (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_4__["default"])().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          _context.p = 0;
          _context.n = 1;
          return _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().login();
        case 1:
          _yield$Taro$login = _context.v;
          code = _yield$Taro$login.code;
          if (code) {
            _context.n = 2;
            break;
          }
          return _context.a(2, null);
        case 2:
          _context.n = 3;
          return (0,_api_user__WEBPACK_IMPORTED_MODULE_2__.apiLogin)(code);
        case 3:
          _yield$apiLogin = _context.v;
          token = _yield$apiLogin.token;
          userInfo = _yield$apiLogin.userInfo;
          _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().setStorageSync(_config__WEBPACK_IMPORTED_MODULE_1__.STORAGE_KEYS.TOKEN, token);
          saveUserInfo(userInfo);
          return _context.a(2, userInfo);
        case 4:
          _context.p = 4;
          _t = _context.v;
          console.error('登录失败', _t);
          return _context.a(2, null);
      }
    }, _callee, null, [[0, 4]]);
  }));
  return function login() {
    return _ref.apply(this, arguments);
  };
}();

/** 拉取最新用户信息并更新缓存 */
var refreshUserInfo = /*#__PURE__*/function () {
  var _ref2 = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_3__["default"])(/*#__PURE__*/(0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_4__["default"])().m(function _callee2() {
    var user, _t2;
    return (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_4__["default"])().w(function (_context2) {
      while (1) switch (_context2.p = _context2.n) {
        case 0:
          _context2.p = 0;
          _context2.n = 1;
          return (0,_api_user__WEBPACK_IMPORTED_MODULE_2__.apiGetProfile)();
        case 1:
          user = _context2.v;
          saveUserInfo(user);
          return _context2.a(2, user);
        case 2:
          _context2.p = 2;
          _t2 = _context2.v;
          return _context2.a(2, null);
      }
    }, _callee2, null, [[0, 2]]);
  }));
  return function refreshUserInfo() {
    return _ref2.apply(this, arguments);
  };
}();

/** 是否拥有某角色 */
var hasRole = function hasRole(code) {
  var _user$roles;
  var user = getUserInfo();
  return !!(user !== null && user !== void 0 && (_user$roles = user.roles) !== null && _user$roles !== void 0 && _user$roles.some(function (r) {
    return r.code === code;
  }));
};

/** 是否管理员 */
var isAdmin = function isAdmin() {
  return hasRole('admin');
};

/** 退出登录 */
var logout = function logout() {
  _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().removeStorageSync(_config__WEBPACK_IMPORTED_MODULE_1__.STORAGE_KEYS.TOKEN);
  _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().removeStorageSync(_config__WEBPACK_IMPORTED_MODULE_1__.STORAGE_KEYS.USER_INFO);
};

/***/ }),

/***/ "./src/utils/pay.ts":
/*!**************************!*\
  !*** ./src/utils/pay.ts ***!
  \**************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "payOrder": function() { return /* binding */ payOrder; }
/* harmony export */ });
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/regenerator.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/regenerator.js");
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/asyncToGenerator.js");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @tarojs/taro */ "webpack/container/remote/@tarojs/taro");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_tarojs_taro__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _api_order__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../api/order */ "./src/api/order.ts");




/**
 * 发起微信支付。
 * 1. 向后端请求 wx.requestPayment 参数
 * 2. 调起微信收银台
 * 3. 返回支付结果
 *
 * 本地开发兜底：后端未配商户号时返回 { mock: true }，此处跳过真实拉起，
 * 直接调用状态接口把订单置为已付款，方便联调。
 */
function payOrder(_x) {
  return _payOrder.apply(this, arguments);
}
function _payOrder() {
  _payOrder = (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_asyncToGenerator_js__WEBPACK_IMPORTED_MODULE_2__["default"])(/*#__PURE__*/(0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_3__["default"])().m(function _callee(orderId) {
    var params, _t, _t2, _t3;
    return (0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_regenerator_js__WEBPACK_IMPORTED_MODULE_3__["default"])().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          _context.p = 0;
          _context.n = 1;
          return (0,_api_order__WEBPACK_IMPORTED_MODULE_1__.apiPayOrder)(orderId);
        case 1:
          params = _context.v;
          _context.n = 3;
          break;
        case 2:
          _context.p = 2;
          _t = _context.v;
          return _context.a(2, 'fail');
        case 3:
          if (!params.mock) {
            _context.n = 7;
            break;
          }
          _context.p = 4;
          _context.n = 5;
          return (0,_api_order__WEBPACK_IMPORTED_MODULE_1__.apiUpdateOrderStatus)(orderId, 'unshipped');
        case 5:
          _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showToast({
            title: '支付成功(模拟)',
            icon: 'success'
          });
          return _context.a(2, 'success');
        case 6:
          _context.p = 6;
          _t2 = _context.v;
          return _context.a(2, 'fail');
        case 7:
          _context.p = 7;
          _context.n = 8;
          return _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().requestPayment({
            timeStamp: params.timeStamp,
            nonceStr: params.nonceStr,
            package: params.package,
            signType: params.signType,
            paySign: params.paySign
          });
        case 8:
          _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showToast({
            title: '支付成功',
            icon: 'success'
          });
          return _context.a(2, 'success');
        case 9:
          _context.p = 9;
          _t3 = _context.v;
          if (!(_t3 !== null && _t3 !== void 0 && _t3.errMsg && /cancel/i.test(_t3.errMsg))) {
            _context.n = 10;
            break;
          }
          _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showToast({
            title: '已取消支付',
            icon: 'none'
          });
          return _context.a(2, 'cancel');
        case 10:
          _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showToast({
            title: '支付失败',
            icon: 'none'
          });
          return _context.a(2, 'fail');
      }
    }, _callee, null, [[7, 9], [4, 6], [0, 2]]);
  }));
  return _payOrder.apply(this, arguments);
}

/***/ }),

/***/ "./src/utils/request.ts":
/*!******************************!*\
  !*** ./src/utils/request.ts ***!
  \******************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "http": function() { return /* binding */ http; }
/* harmony export */ });
/* unused harmony export request */
/* harmony import */ var _Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_objectSpread2_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/objectSpread2.js */ "./node_modules/.pnpm/@babel+runtime@7.28.6/node_modules/@babel/runtime/helpers/esm/objectSpread2.js");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @tarojs/taro */ "webpack/container/remote/@tarojs/taro");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_tarojs_taro__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _config__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../config */ "./src/config/index.ts");




/** 后端统一返回包装（按需调整） */

var isRedirecting = false;

/**
 * 统一请求封装：自动加 baseUrl、带 token、处理 401 与错误提示。
 * 直接 resolve 后端返回的业务数据。
 */
function request(options) {
  var url = options.url,
    _options$method = options.method,
    method = _options$method === void 0 ? 'GET' : _options$method,
    data = options.data,
    _options$auth = options.auth,
    auth = _options$auth === void 0 ? true : _options$auth,
    _options$silent = options.silent,
    silent = _options$silent === void 0 ? false : _options$silent;
  var header = {
    'Content-Type': 'application/json'
  };
  if (auth) {
    var token = _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().getStorageSync(_config__WEBPACK_IMPORTED_MODULE_1__.STORAGE_KEYS.TOKEN);
    if (token) header.Authorization = "Bearer ".concat(token);
  }
  return new Promise(function (resolve, reject) {
    _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().request({
      url: "".concat(_config__WEBPACK_IMPORTED_MODULE_1__.BASE_URL).concat(url),
      method: method,
      data: data,
      header: header,
      success: function success(res) {
        var statusCode = res.statusCode,
          body = res.data;
        if (statusCode >= 200 && statusCode < 300) {
          resolve(body);
          return;
        }
        // 登录态失效
        if (statusCode === 401) {
          handleUnauthorized();
          reject(res);
          return;
        }
        var msg = (body === null || body === void 0 ? void 0 : body.message) || "\u8BF7\u6C42\u5931\u8D25(".concat(statusCode, ")");
        if (!silent) _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showToast({
          title: String(msg),
          icon: 'none'
        });
        reject(res);
      },
      fail: function fail(err) {
        if (!silent) _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showToast({
          title: '网络异常',
          icon: 'none'
        });
        reject(err);
      }
    });
  });
}

/** 清理登录态并提示重新登录 */
function handleUnauthorized() {
  _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().removeStorageSync(_config__WEBPACK_IMPORTED_MODULE_1__.STORAGE_KEYS.TOKEN);
  _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().removeStorageSync(_config__WEBPACK_IMPORTED_MODULE_1__.STORAGE_KEYS.USER_INFO);
  if (isRedirecting) return;
  isRedirecting = true;
  _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().showToast({
    title: '登录已过期',
    icon: 'none'
  });
  setTimeout(function () {
    isRedirecting = false;
  }, 1500);
}
var http = {
  get: function get(url, opts) {
    return request((0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_objectSpread2_js__WEBPACK_IMPORTED_MODULE_2__["default"])({
      url: url,
      method: 'GET'
    }, opts));
  },
  post: function post(url, data, opts) {
    return request((0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_objectSpread2_js__WEBPACK_IMPORTED_MODULE_2__["default"])({
      url: url,
      method: 'POST',
      data: data
    }, opts));
  },
  put: function put(url, data, opts) {
    return request((0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_objectSpread2_js__WEBPACK_IMPORTED_MODULE_2__["default"])({
      url: url,
      method: 'PUT',
      data: data
    }, opts));
  },
  delete: function _delete(url, opts) {
    return request((0,_Users_yang_fe_fe_miniapp_node_modules_pnpm_babel_runtime_7_28_6_node_modules_babel_runtime_helpers_esm_objectSpread2_js__WEBPACK_IMPORTED_MODULE_2__["default"])({
      url: url,
      method: 'DELETE'
    }, opts));
  }
};

/***/ }),

/***/ "./src/utils/tracker.ts":
/*!******************************!*\
  !*** ./src/utils/tracker.ts ***!
  \******************************/
/***/ (function(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "flush": function() { return /* binding */ flush; },
/* harmony export */   "initTracker": function() { return /* binding */ initTracker; },
/* harmony export */   "track": function() { return /* binding */ track; },
/* harmony export */   "trackPageView": function() { return /* binding */ trackPageView; }
/* harmony export */ });
/* unused harmony export tracker */
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @tarojs/taro */ "webpack/container/remote/@tarojs/taro");
/* harmony import */ var _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_tarojs_taro__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _api_track__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../api/track */ "./src/api/track.ts");
/* harmony import */ var _store_userStore__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../store/userStore */ "./src/store/userStore.ts");




// 触发上报的阈值
var FLUSH_SIZE = 10; // 累计条数
var FLUSH_INTERVAL = 5000; // 间隔(ms)

var queue = [];
var timer = null;
var sessionId = '';
var systemInfo = {};

/** 生成会话 id（一次启动一个） */
function genSessionId() {
  return "".concat(Date.now(), "-").concat(Math.random().toString(36).slice(2, 10));
}

/** 初始化：App 启动时调一次 */
function initTracker() {
  sessionId = genSessionId();
  try {
    var _Taro$getAccountInfoS, _account$miniProgram;
    var info = _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().getSystemInfoSync();
    var account = (_Taro$getAccountInfoS = (_tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().getAccountInfoSync)) === null || _Taro$getAccountInfoS === void 0 ? void 0 : _Taro$getAccountInfoS.call((_tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default()));
    systemInfo = {
      os: info.system,
      appVersion: (account === null || account === void 0 || (_account$miniProgram = account.miniProgram) === null || _account$miniProgram === void 0 ? void 0 : _account$miniProgram.version) || info.version
    };
  } catch (_unused) {
    systemInfo = {};
  }
}

/** 当前页面路径 */
function currentPage() {
  try {
    var pages = _tarojs_taro__WEBPACK_IMPORTED_MODULE_0___default().getCurrentPages();
    var cur = pages[pages.length - 1];
    return cur ? "/".concat(cur.route) : '';
  } catch (_unused2) {
    return '';
  }
}

/** 立即上报队列 */
function flush() {
  if (queue.length === 0) return;
  var batch = queue;
  queue = [];
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  (0,_api_track__WEBPACK_IMPORTED_MODULE_1__.reportEvents)(batch);
}
function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(function () {
    timer = null;
    flush();
  }, FLUSH_INTERVAL);
}

/**
 * 埋点：业务侧只需 track('add_to_cart', { productId })。
 * SDK 自动补 openid / sessionId / page / 平台 / 时间等公共参数。
 */
function track(eventName, params) {
  var eventType = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'custom';
  var user = (0,_store_userStore__WEBPACK_IMPORTED_MODULE_2__.getUserInfo)();
  queue.push({
    eventName: eventName,
    eventType: eventType,
    openid: user === null || user === void 0 ? void 0 : user.openid,
    sessionId: sessionId,
    page: currentPage(),
    params: params,
    platform: 'mp-weixin',
    appVersion: systemInfo.appVersion,
    os: systemInfo.os,
    ts: Date.now()
  });
  if (queue.length >= FLUSH_SIZE) {
    flush();
  } else {
    scheduleFlush();
  }
}

/** 页面曝光 */
function trackPageView(page) {
  track('page_view', {
    page: page || currentPage()
  }, 'pageview');
}
var tracker = {
  initTracker: initTracker,
  track: track,
  trackPageView: trackPageView,
  flush: flush
};
/* unused harmony default export */ var __WEBPACK_DEFAULT_EXPORT__ = (tracker);

/***/ })

}]);
//# sourceMappingURL=common.js.map