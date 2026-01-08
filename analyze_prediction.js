const fs = require('fs');
const path = require('path');

const historyPath = path.join(__dirname, 'public/history.txt');

try {
    const content = fs.readFileSync(historyPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    const parsedLines = lines.map(line => {
        // Remove potential leading "N: " if present (though file viewing didn't show it in raw)
        // The previous view_file output showed "1: ..." but the tool note said "The following code has been modified to include a line number".
        // So the raw file likely just has numbers.
        // We split by comma and trim.
        return line.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    });

    console.log(`Loaded ${parsedLines.length} lines of history.`);

    // 1. Analyze constraints (min/max numbers) to understand the pool
    let min = Infinity;
    let max = -Infinity;
    const allNumbers = new Set();

    parsedLines.forEach(row => {
        row.forEach(num => {
            if (num < min) min = num;
            if (num > max) max = num;
            allNumbers.add(num);
        });
    });

    console.log(`Number Range: ${min} - ${max}`);
    console.log(`Unique numbers found: ${allNumbers.size}`);

    // 2. Validate Hypothesis: "Numbers in previous line are NOT in next line"
    let totalPairs = 0;
    let zeroIntersectionPairs = 0;
    let totalIntersections = 0;

    for (let i = 0; i < parsedLines.length - 1; i++) {
        const current = new Set(parsedLines[i]);
        const next = parsedLines[i + 1];

        const intersection = next.filter(n => current.has(n));

        totalPairs++;
        totalIntersections += intersection.length;
        if (intersection.length === 0) {
            zeroIntersectionPairs++;
        }
    }

    const perfectExclusionRate = (zeroIntersectionPairs / totalPairs) * 100;
    const avgIntersection = totalIntersections / totalPairs;

    console.log('\n--- Analysis Results ---');
    console.log(`Total transitions analyzed: ${totalPairs}`);
    console.log(`Transitions with ZERO overlap: ${zeroIntersectionPairs} (${perfectExclusionRate.toFixed(2)}%)`);
    console.log(`Average overlapping numbers per line: ${avgIntersection.toFixed(2)}`);

    // 3. Prediction for next line
    const lastLine = parsedLines[parsedLines.length - 1];
    console.log('\n--- Prediction for Next Line ---');
    console.log(`Last line (Row ${parsedLines.length}): [${lastLine.join(', ')}]`);

    // Assuming the pool is min to max (likely 1-49 based on observation)
    // If the user wants strictly "not in previous", we just exclude lastLine from the full set.

    const pool = [];
    // Use observed max for pool upper bound, assumed 1 for lower if min > 1, but let's stick to observed range.
    // Actually, lottery usually implies a fixed range. Observed 1-49.
    const rangeMax = max < 49 ? 49 : max; // Assume at least 49 if seen numbers suggest it

    for (let i = 1; i <= rangeMax; i++) {
        pool.push(i);
    }

    const lastLineSet = new Set(lastLine);
    const predictionCandidates = pool.filter(n => !lastLineSet.has(n));

    console.log(`\nPredicted rule: "Next line will likely NOT contain these numbers: ${lastLine.join(', ')}"`);
    console.log(`Candidate numbers for next line (Total ${predictionCandidates.length}):`);
    console.log(predictionCandidates.join(', '));

} catch (err) {
    console.error("Error reading or processing file:", err);
}
