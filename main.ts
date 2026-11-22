// Tiny Stack VM, ISA v1 (make.fun, 22 Nov 2026). Faithful interpreter:
// one run answers a whole set, reading program.bin/input.bin per instance
// and writing stdout.bin and exit.txt. Node 22, stdlib only.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Limits (ISA.md): 256 stack, 64 call depth, 256 words, 1M steps, 64K out.
const STACK_MAX = 256;
const CALLS_MAX = 64;
const MEMORY_WORDS = 256;
const STEP_LIMIT = 1_000_000;
const OUTPUT_MAX = 65_536;

// Trap codes (ISA.md). A trap ends the program at once, keeps prior
// output, and is the exit code.
const TRAP = {
  UNDERFLOW: 2, OVERFLOW: 3, DIV_ZERO: 4, BAD_OPCODE: 5, MEMORY: 6,
  CALL_DEPTH: 7, RET_EMPTY: 8, PC: 9, STEPS: 10, OUTPUT: 11,
};

function trap(code: number): never {
  throw code;
}

// Opcode metadata (reference VM's OPS table): [imm bytes, popped,
// pushed] per opcode; the loop checks ISA.md's rules with it first.
const OP_INFO = {
  0x00: [0,0,0], 0x01: [1,0,1], 0x02: [4,0,1], 0x03: [0,1,0],
  0x04: [0,1,2], 0x05: [0,2,2], 0x06: [0,2,3], 0x07: [0,3,3],
  0x10: [0,2,1], 0x11: [0,2,1], 0x12: [0,2,1], 0x13: [0,2,1],
  0x14: [0,2,1], 0x15: [0,2,1], 0x16: [0,2,1], 0x17: [0,1,1],
  0x18: [0,2,1], 0x19: [0,2,1], 0x1a: [0,2,1], 0x1b: [0,1,1],
  0x1c: [0,2,1], 0x1d: [0,2,1], 0x1e: [0,2,1], 0x20: [0,2,1],
  0x21: [0,2,1], 0x22: [0,2,1], 0x30: [2,0,0], 0x31: [2,1,0],
  0x32: [2,1,0], 0x33: [2,0,0], 0x34: [0,0,0], 0x40: [0,1,1],
  0x41: [0,2,0], 0x50: [0,1,0], 0x51: [0,1,0], 0x52: [0,0,1],
  0x53: [0,1,0],
};

// Binary ops (a, b), b on top, one result. Arithmetic wraps mod 2^32;
// DIV truncates toward zero, MOD keeps a's sign, DIVU/MODU/LTU unsigned.
const BIN = {
  0x10: (a,b)=>(a+b)|0,
  0x11: (a,b)=>(a-b)|0,
  0x12: (a,b)=>Math.imul(a,b),
  0x13: (a,b)=>b===0 ? trap(TRAP.DIV_ZERO) : a===-2147483648 && b===-1 ? a : (a/b)|0,
  0x14: (a,b)=>b===0 ? trap(TRAP.DIV_ZERO) : b===-1 ? 0 : (a%b)|0,
  0x15: (a,b)=>b===0 ? trap(TRAP.DIV_ZERO) : Math.floor((a>>>0)/(b>>>0))|0,
  0x16: (a,b)=>b===0 ? trap(TRAP.DIV_ZERO) : (a>>>0)%(b>>>0)|0,
  0x18: (a,b)=>a&b,
  0x19: (a,b)=>a|b,
  0x1a: (a,b)=>a^b,
  0x1c: (a,b)=>a<<(b&31),
  0x1d: (a,b)=>a>>(b&31),
  0x1e: (a,b)=>(a>>>(b&31))|0,
  0x20: (a,b)=>a===b ? 1 : 0,
  0x21: (a,b)=>a<b ? 1 : 0,
  0x22: (a,b)=>a>>>0 < (b>>>0) ? 1 : 0,
};

// Run one program, returning what the reference VM produces.
function runProgram(program: Buffer, input: Buffer) {
  const data = new Int32Array(STACK_MAX);
  let sp = 0;
  const calls = new Int32Array(CALLS_MAX);
  let csp = 0;
  const memory = new Int32Array(MEMORY_WORDS);
  const output = new Uint8Array(OUTPUT_MAX);
  let outLen = 0;
  let inPos = 0;
  let pc = 0;
  let steps = 0;

  const finish = (exit: number) => ({ stdout: output.subarray(0, outLen), exit });

  try {
    for (;;) {
      // ISA.md "One step", in order: limit, pc, opcode, immediate fit.
      if (steps === STEP_LIMIT) trap(TRAP.STEPS);
      if (pc < 0 || pc >= program.length) trap(TRAP.PC);
      const opcode = program[pc];
      const info = OP_INFO[opcode];
      if (info === undefined) trap(TRAP.BAD_OPCODE);
      const [imm, pops, pushes] = info;
      if (pc + imm >= program.length) trap(TRAP.PC);
      steps += 1;
      const next = pc + 1 + imm;
      // Stack needs are checked before the instruction's own traps.
      if (sp < pops) trap(TRAP.UNDERFLOW);
      if (sp - pops + pushes > STACK_MAX) trap(TRAP.OVERFLOW);
      pc = next;

      const bin = BIN[opcode];
      if (bin !== undefined) {
        const b = data[sp - 1];
        const a = data[sp - 2];
        sp -= 2;
        data[sp++] = bin(a, b);
        continue;
      }

      switch (opcode) {
        case 0x00: return finish(0); // HALT
        case 0x01: data[sp++] = (program[next - 1] << 24) >> 24; break; // PUSH8, sign-extended
        case 0x02: // PUSH32, signed 32-bit little-endian
          data[sp++] = program[next - 4] | (program[next - 3] << 8) |
            (program[next - 2] << 16) | (program[next - 1] << 24);
          break;
        case 0x03: sp -= 1; break; // POP
        case 0x04: data[sp] = data[sp - 1]; sp += 1; break; // DUP: spelled out (data[sp++] reads above the top)
        case 0x05: { const t = data[sp - 1]; data[sp - 1] = data[sp - 2]; data[sp - 2] = t; break; } // SWAP
        case 0x06: data[sp] = data[sp - 2]; sp += 1; break; // OVER: same reason as DUP
        case 0x07: { const a = data[sp - 3]; data[sp - 3] = data[sp - 2]; data[sp - 2] = data[sp - 1]; data[sp - 1] = a; break; } // ROT (a b c -- b c a)
        case 0x17: data[sp - 1] = (-data[sp - 1]) | 0; break; // NEG, wraps
        case 0x1b: data[sp - 1] = ~data[sp - 1]; break; // NOT
        case 0x30: pc = next + (((program[next - 2] | (program[next - 1] << 8)) << 16) >> 16); break; // JMP
        case 0x31: case 0x32: { // JZ / JNZ
          const v = data[--sp];
          if ((opcode === 0x31) === (v === 0)) pc = next + (((program[next - 2] | (program[next - 1] << 8)) << 16) >> 16);
          break;
        }
        case 0x33: // CALL
          if (csp === CALLS_MAX) trap(TRAP.CALL_DEPTH);
          calls[csp++] = next;
          pc = program[next - 2] | (program[next - 1] << 8);
          break;
        case 0x34: // RET
          if (csp === 0) trap(TRAP.RET_EMPTY);
          pc = calls[--csp];
          break;
        case 0x40: { // LOAD
          const addr = data[sp - 1];
          if (addr < 0 || addr >= MEMORY_WORDS) trap(TRAP.MEMORY);
          data[sp - 1] = memory[addr];
          break;
        }
        case 0x41: { // STORE ( v addr -- )
          const addr = data[sp - 1];
          const value = data[sp - 2];
          if (addr < 0 || addr >= MEMORY_WORDS) trap(TRAP.MEMORY);
          sp -= 2;
          memory[addr] = value;
          break;
        }
        case 0x50: { // PRINT, decimal ASCII. A write past the limit traps 11,
          // writing none of its bytes.
          const text = String(data[sp - 1]);
          if (outLen + text.length > OUTPUT_MAX) trap(TRAP.OUTPUT);
          sp -= 1;
          output.set(Buffer.from(text, 'ascii'), outLen);
          outLen += text.length;
          break;
        }
        case 0x51: // PUTC, one byte v AND 255
          if (outLen + 1 > OUTPUT_MAX) trap(TRAP.OUTPUT);
          output[outLen++] = data[--sp] & 255;
          break;
        case 0x52: data[sp++] = inPos < input.length ? input[inPos++] : -1; break; // IN, -1 past the end
        case 0x53: return finish(data[sp - 1] & 255); // EXIT
        default: trap(TRAP.BAD_OPCODE); // unreachable: checked above
      }
    }
  } catch (e) {
    // A trap: its code is the exit code, prior output is kept.
    return finish(e as number);
  }
}

// Answer every instance in id order (env dirs locally, /input and /output on the grader).
const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

for (const id of readdirSync(inputDir).sort()) {
  const { stdout, exit } = runProgram(
    readFileSync(join(inputDir, id, 'program.bin')),
    readFileSync(join(inputDir, id, 'input.bin')));
  mkdirSync(join(outputDir, id), { recursive: true });
  writeFileSync(join(outputDir, id, 'stdout.bin'), stdout);
  writeFileSync(join(outputDir, id, 'exit.txt'), `${exit}\n`);
}
