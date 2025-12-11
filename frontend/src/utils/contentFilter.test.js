/**
 * Test Content Filter
 * Chạy file này để test chức năng lọc từ ngữ độc hại
 */

import { filterOffensiveContent, containsOffensiveContent } from './contentFilter';

// Test cases
const testCases = [
  {
    input: "Bạn là thằng óc chó",
    expected: "Bạn là thằng ******"
  },
  {
    input: "fuckfuckfuckfuck",
    expected: "****************"
  },
  {
    input: "Đây là tin nhắn bình thường",
    expected: "Đây là tin nhắn bình thường"
  },
  {
    input: "Mày là con đĩ",
    expected: "Mày là con ***"
  },
  {
    input: "đéođéođéo",
    expected: "***********"
  },
  {
    input: "Hello world, this is a normal message",
    expected: "Hello world, this is a normal message"
  },
  {
    input: "dm mày",
    expected: "** mày"
  }
];

// Run tests
async function runTests() {
  console.log('🧪 Testing Content Filter...\n');

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const result = await filterOffensiveContent(testCase.input);
    const passed = result === testCase.expected;
    
    console.log(`Test ${i + 1}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  Input:    "${testCase.input}"`);
    console.log(`  Expected: "${testCase.expected}"`);
    console.log(`  Got:      "${result}"`);
    console.log('');
  }

  // Test containsOffensiveContent
  console.log('🔍 Testing containsOffensiveContent...\n');
  
  const containsTests = [
    { text: "Bạn là thằng óc chó", shouldContain: true },
    { text: "Hello world", shouldContain: false },
    { text: "fuck you", shouldContain: true },
    { text: "Xin chào", shouldContain: false }
  ];

  for (const test of containsTests) {
    const contains = await containsOffensiveContent(test.text);
    const passed = contains === test.shouldContain;
    
    console.log(`${passed ? '✅' : '❌'} "${test.text}" - Contains: ${contains} (Expected: ${test.shouldContain})`);
  }
}

// Export for use in console
export { runTests };

// Auto-run if in browser console
if (typeof window !== 'undefined') {
  window.testContentFilter = runTests;
  console.log('💡 Run "window.testContentFilter()" to test content filter');
}
