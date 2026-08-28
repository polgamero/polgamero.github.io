#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {buildHeadlessCoverageReport} from '../js/headlessCoverage.js';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..');
const files=['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
const cards=files.flatMap(source=>JSON.parse(fs.readFileSync(path.join(root,'assets/data',source),'utf8')).map(card=>({source,card})));
const report=buildHeadlessCoverageReport(cards);
const outIdx=process.argv.indexOf('--out'); if(outIdx>=0&&process.argv[outIdx+1]) fs.writeFileSync(path.resolve(process.argv[outIdx+1]),JSON.stringify(report,null,2));
console.log(`HEADLESS_COVERAGE_23_18_2_OK total=${report.total} full=${report.counts.FULL} partial=${report.counts.PARTIAL} unsupported=${report.counts.UNSUPPORTED} fullPct=${report.fullPct} structurallyKnownPct=${report.structurallyKnownPct}`);
for(const [source,b] of Object.entries(report.bySource)) console.log(`${source}: total=${b.total} full=${b.FULL} partial=${b.PARTIAL} unsupported=${b.UNSUPPORTED}`);
console.log('topReasons='+report.topReasons.slice(0,12).map(x=>`${x.reason}:${x.count}`).join(','));
