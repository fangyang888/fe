'use strict';

const { createWvAgentKoaMiddleware } = require('./middleware.cjs');

module.exports = createWvAgentKoaMiddleware;
module.exports.createWvAgentKoaMiddleware = createWvAgentKoaMiddleware;
