import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

import { signSessionToken } from './services/authService.js';
import { getUserById } from './repositories/userRepository.js';

interface RequestTimingResult {
  question: string;
  statusCode: number;
  engineUsed: string;
  totalClientMs: number;
  timings?: {
    authMs: number;
    dbRetrievalMs: number;
    metricCalculationMs: number;
    intentDetectionMs: number;
    promptBuildMs: number;
    geminiMs: number;
    totalMs: number;
  };
  replyPreview: string;
}

function postChat(token: string, message: string, mode: string = 'gemini'): Promise<{ statusCode: number; data: any; elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      message,
      mode,
      clientDate: '2026-11-04T12:00:00.000Z',
    });

    const options: http.RequestOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const start = performance.now();
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const elapsedMs = parseFloat((performance.now() - start).toFixed(2));
        try {
          const json = JSON.parse(body);
          resolve({ statusCode: res.statusCode || 500, data: json, elapsedMs });
        } catch {
          resolve({ statusCode: res.statusCode || 500, data: { body }, elapsedMs });
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

export async function runBenchmark(label: string = 'CURRENT RUN') {
  console.log(`\n======================================================`);
  console.log(` FinSight AI Chatbot Latency Benchmark: ${label}`);
  console.log(`======================================================`);

  // Target User A with real transactions
  const targetUserId = 'usr_1793218238197_wlal7w';
  const user = await getUserById(targetUserId);
  if (!user) {
    throw new Error(`Target user ${targetUserId} not found in database.`);
  }

  const token = signSessionToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  const questions = [
    'What were my total expenses this month?',
    'How much did I earn last month?',
    "How much is left after last month's expenses?",
    'How much did I spend on food this month?',
    'Am I over budget?',
  ];

  const results: RequestTimingResult[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`\n[${i + 1}/${questions.length}] Querying: "${q}"...`);
    const res = await postChat(token, q, 'gemini');
    
    const reply = res.data?.reply || res.data?.message || '';
    const preview = reply.replace(/\n/g, ' ').slice(0, 100);
    const timings = res.data?.timings;

    const result: RequestTimingResult = {
      question: q,
      statusCode: res.statusCode,
      engineUsed: res.data?.engineUsed || 'unknown',
      totalClientMs: res.elapsedMs,
      timings,
      replyPreview: preview,
    };
    results.push(result);

    console.log(`  -> Status: ${res.statusCode} | Engine: ${result.engineUsed} | Client Roundtrip: ${res.elapsedMs}ms`);
    if (timings) {
      console.log(`  -> Server Timings: Auth=${timings.authMs}ms | DB=${timings.dbRetrievalMs}ms | Calc=${timings.metricCalculationMs}ms | Intent=${timings.intentDetectionMs}ms | Prompt=${timings.promptBuildMs}ms | Gemini=${timings.geminiMs}ms | ServerTotal=${timings.totalMs}ms`);
    } else {
      console.log(`  -> Server Timings: not returned (check response data: ${JSON.stringify(res.data)})`);
    }
    console.log(`  -> Reply: "${preview}..."`);
  }

  console.log(`\n======================================================`);
  console.log(` SUMMARY OF RESULTS (${label})`);
  console.log(`======================================================`);
  console.table(
    results.map((r) => ({
      Question: r.question,
      Status: r.statusCode,
      Engine: r.engineUsed,
      AuthMs: r.timings?.authMs,
      DbMs: r.timings?.dbRetrievalMs,
      CalcMs: r.timings?.metricCalculationMs,
      IntentMs: r.timings?.intentDetectionMs,
      GeminiMs: r.timings?.geminiMs,
      ServerTotalMs: r.timings?.totalMs,
      ClientMs: r.totalClientMs,
    }))
  );

  const avgClient = results.reduce((a, b) => a + b.totalClientMs, 0) / results.length;
  const avgGemini = results.reduce((a, b) => a + (b.timings?.geminiMs || 0), 0) / results.length;
  const avgDb = results.reduce((a, b) => a + (b.timings?.dbRetrievalMs || 0), 0) / results.length;
  const avgCalc = results.reduce((a, b) => a + (b.timings?.metricCalculationMs || 0), 0) / results.length;

  console.log(`\nAverage Client Roundtrip: ${avgClient.toFixed(2)}ms (${(avgClient / 1000).toFixed(2)}s)`);
  console.log(`Average Gemini API Time: ${avgGemini.toFixed(2)}ms (${(avgGemini / 1000).toFixed(2)}s)`);
  console.log(`Average DB Retrieval Time: ${avgDb.toFixed(2)}ms (${(avgDb / 1000).toFixed(2)}s)`);
  console.log(`Average Calc Time: ${avgCalc.toFixed(2)}ms`);

  return results;
}

if (process.argv[1]?.endsWith('benchmarkChatLatency.ts')) {
  runBenchmark('BASELINE MEASUREMENT')
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}

