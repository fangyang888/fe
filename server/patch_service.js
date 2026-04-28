const fs = require('fs');

let code = fs.readFileSync('/Users/yang/fe/fe/server/src/predictor/predictor.service.ts', 'utf-8');

// Insert new BoundedCaches
code = code.replace(
  /private memoStrategy = new BoundedCache<number, any>\(500\);/,
  `private memoStrategy = new BoundedCache<number, any>(500);
  private memoApriori = new BoundedCache<number, any>(500);
  private memoCrossRepulsion = new BoundedCache<string, any>(500);`
);

code = code.replace(
  /this\.memoStrategy\.clear\(\);/,
  `this.memoStrategy.clear();
      this.memoApriori.clear();
      this.memoCrossRepulsion.clear();`
);

// Memoize getCrossPerioRepulsionScores
code = code.replace(
  /private getCrossPerioRepulsionScores\(hist: number\[]\[], threshold = 0\.10\): number\[] \{/,
  `private getCrossPerioRepulsionScores(hist: number[][], threshold = 0.10): number[] {
    const key = \`\${hist.length}-\${threshold}\`;
    if (this.memoCrossRepulsion.has(key)) return this.memoCrossRepulsion.get(key);
    const res = this.getCrossPerioRepulsionScoresInternal(hist, threshold);
    this.memoCrossRepulsion.set(key, res);
    return res;
  }
  private getCrossPerioRepulsionScoresInternal(hist: number[][], threshold = 0.10): number[] {`
);

// Memoize getAprioriRepulsionRules
code = code.replace(
  /private getAprioriRepulsionRules\(hist: number\[]\[]\): \{ scores: number\[]; rules: any\[] \} \{/,
  `private getAprioriRepulsionRules(hist: number[][]): { scores: number[]; rules: any[] } {
    const key = hist.length;
    if (this.memoApriori.has(key)) return this.memoApriori.get(key);
    const res = this.getAprioriRepulsionRulesInternal(hist);
    this.memoApriori.set(key, res);
    return res;
  }
  private getAprioriRepulsionRulesInternal(hist: number[][]): { scores: number[]; rules: any[] } {`
);

fs.writeFileSync('/Users/yang/fe/fe/server/src/predictor/predictor.service.ts', code);
console.log('Successfully patched for memoizing matrix calculations.');
