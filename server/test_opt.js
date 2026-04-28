const { PredictorService } = require('./dist/src/predictor/predictor.service.js');
const { HistoryService } = require('./dist/src/history/history.service.js');
const fs = require('fs');

const d = require('./hist.json');
const hist = d.map(item => [item.n1, item.n2, item.n3, item.n4, item.n5, item.n6, item.n7]);

// We need a dummy history service
const dummyHistoryService = { findAll: async () => d };
const svc = new PredictorService(dummyHistoryService);

const stats = svc.runBacktest(hist, 10, 50);
console.log('Original overall accuracy:', stats.overallAccuracy + '%');

// Let's modify the grid to just one specific set of params to see what it does.
// Since we don't want to modify the actual compiled file, we can just test the logic here.
