```ts
/**
 * Leibniz Lisp Generator
 *
 * Blockly -> Lisp S-expression compiler.
 *
 * The design goal is deliberately simple:
 *
 *     Blockly AST
 *          ↓
 *     Lisp S-expression
 *          ↓
 *     Lisp compiler / evaluator
 *
 * Lisp is treated as the canonical intermediate representation.
 *
 * Examples:
 *
 *   (+ 2 3)
 *   (if (> x 10) (print x) (print 0))
 *   (define square (lambda (x) (* x x)))
 *
 * This file intentionally does not attempt to implement Common Lisp.
 * It defines a small Lisp IR that Leibniz can grow into.
 */

import * as Blockly from 'blockly/core';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type LispAtom = string | number | boolean | null;

export type Lisp =
  | LispAtom
  | Lisp[];

export interface LispGeneratorOptions {
  indent?: string;
  pretty?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Lisp printer                                                               */
/* -------------------------------------------------------------------------- */

export function printLisp(
  expression: Lisp,
  options: LispGeneratorOptions = {},
): string {
  const indent = options.indent ?? '  ';
  const pretty = options.pretty ?? true;

  function escapeString(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  function atom(value: LispAtom): string {
    if (value === null) return 'nil';

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (typeof value === 'number') {
      return String(value);
    }

    return value;
  }

  function print(value: Lisp, depth: number): string {
    if (!Array.isArray(value)) {
      return atom(value);
    }

    if (value.length === 0) {
      return '()';
    }

    const oneLine = `(${value.map((x) => print(x, depth + 1)).join(' ')})`;

    if (!pretty || oneLine.length < 80) {
      return oneLine;
    }

    const padding = indent.repeat(depth + 1);

    return `(\n${padding}${value
      .map((x) => print(x, depth + 1))
      .join(`\n${padding}`)}\n${indent.repeat(depth)})`;
  }

  return print(expression, 0);
}

/* -------------------------------------------------------------------------- */
/* Generator                                                                   */
/* -------------------------------------------------------------------------- */

export class LispGenerator extends Blockly.CodeGenerator {
  constructor(name = 'LeibnizLisp') {
    super(name);

    this.ORDER_ATOMIC = 0;
    this.ORDER_FUNCTION_CALL = 1;
    this.ORDER_MULTIPLICATIVE = 2;
    this.ORDER_ADDITIVE = 3;
    this.ORDER_RELATIONAL = 4;
    this.ORDER_LOGICAL = 5;
    this.ORDER_NONE = 99;
  }

  /**
   * Blockly calls this to generate a complete workspace.
   *
   * Every top-level block becomes a Lisp form.
   */
  workspaceToCode(workspace: Blockly.Workspace): string {
    const forms: Lisp[] = [];

    const blocks = workspace.getTopBlocks(true);

    for (const block of blocks) {
      const code = this.blockToLisp(block);

      if (code !== null) {
        forms.push(code);
      }
    }

    return forms
      .map((form) => printLisp(form))
      .join('\n');
  }

  /**
   * Convert one Blockly block to Lisp.
   *
   * Unknown blocks are represented rather than silently discarded.
   * This makes the IR extensible and debuggable.
   */
  blockToLisp(block: Blockly.Block): Lisp | null {
    switch (block.type) {
      /* ------------------------------------------------------------------ */
      /* Values                                                               */
      /* ------------------------------------------------------------------ */

      case 'math_number': {
        const value = block.getFieldValue('NUM');
        return Number(value);
      }

      case 'text': {
        const value = block.getFieldValue('TEXT') ?? '';
        return `"${this.escapeString(String(value))}"`;
      }

      case 'logic_boolean': {
        return block.getFieldValue('BOOL') === 'TRUE';
      }

      /* ------------------------------------------------------------------ */
      /* Arithmetic                                                           */
      /* ------------------------------------------------------------------ */

      case 'math_arithmetic': {
        const op = block.getFieldValue('OP');

        const a = this.input(block, 'A');
        const b = this.input(block, 'B');

        const operator: Record<string, string> = {
          ADD: '+',
          MINUS: '-',
          MULTIPLY: '*',
          DIVIDE: '/',
          POWER: 'expt',
        };

        return [
          operator[op] ?? op.toLowerCase(),
          a ?? 0,
          b ?? 0,
        ];
      }

      /* ------------------------------------------------------------------ */
      /* Logic                                                                */
      /* ------------------------------------------------------------------ */

      case 'logic_compare': {
        const op = block.getFieldValue('OP');

        const a = this.input(block, 'A');
        const b = this.input(block, 'B');

        const operator: Record<string, string> = {
          EQ: '=',
          NEQ: '!=',
          LT: '<',
          LTE: '<=',
          GT: '>',
          GTE: '>=',
        };

        return [
          operator[op] ?? op.toLowerCase(),
          a ?? 'nil',
          b ?? 'nil',
        ];
      }

      case 'logic_operation': {
        const op = block.getFieldValue('OP');

        const a = this.input(block, 'A');
        const b = this.input(block, 'B');

        const operator = op === 'AND' ? 'and' : 'or';

        return [
          operator,
          a ?? false,
          b ?? false,
        ];
      }

      case 'logic_negate': {
        return [
          'not',
          this.input(block, 'BOOL') ?? false,
        ];
      }

      /* ------------------------------------------------------------------ */
      /* Variables                                                            */
      /* ------------------------------------------------------------------ */

      case 'variables_get': {
        const variable = block.getField('VAR');

        if (!variable) {
          return 'unknown-variable';
        }

        return this.symbol(variable.getText());
      }

      case 'variables_set': {
        const variable = block.getField('VAR');

        const name = variable
          ? this.symbol(variable.getText())
          : 'unknown-variable';

        return [
          'set!',
          name,
          this.input(block, 'VALUE') ?? 'nil',
        ];
      }

      /* ------------------------------------------------------------------ */
      /* Control                                                              */
      /* ------------------------------------------------------------------ */

      case 'controls_if': {
        return this.generateIf(block);
      }

      case 'controls_repeat_ext': {
        const times =
          this.input(block, 'TIMES') ??
          0;

        const body = this.statementList(block, 'DO');

        return [
          'repeat',
          times,
          body,
        ];
      }

      case 'controls_whileUntil': {
        const mode = block.getFieldValue('MODE');

        const condition =
          this.input(block, 'BOOL') ??
          false;

        const body =
          this.statementList(block, 'DO');

        return [
          mode === 'UNTIL' ? 'until' : 'while',
          condition,
          body,
        ];
      }

      /* ------------------------------------------------------------------ */
      /* Text                                                                  */
      /* ------------------------------------------------------------------ */

      case 'text_join': {
        const count =
          block.inputList.filter(
            (input) => input.name.startsWith('ADD'),
          ).length;

        const values: Lisp[] = [];

        for (let i = 0; i < count; i++) {
          values.push(
            this.input(block, `ADD${i}`) ?? 'nil',
          );
        }

        return [
          'str',
          ...values,
        ];
      }

      /* ------------------------------------------------------------------ */
      /* Leibniz-native blocks                                                */
      /* ------------------------------------------------------------------ */

      case 'lisp_quote': {
        return [
          'quote',
          this.input(block, 'VALUE') ?? 'nil',
        ];
      }

      case 'lisp_call': {
        const functionName =
          block.getFieldValue('FUNCTION') ||
          'lambda';

        const args: Lisp[] = [];

        for (const input of block.inputList) {
          if (input.name) {
            const value = this.input(block, input.name);

            if (value !== null) {
              args.push(value ?? 'nil');
            }
          }
        }

        return [
          this.symbol(functionName),
          ...args,
        ];
      }

      /* ------------------------------------------------------------------ */
      /* Unknown block                                                        */
      /* ------------------------------------------------------------------ */

      default: {
        return [
          'block',
          this.symbol(block.type),
          this.blockInputs(block),
        ];
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Helpers                                                                */
  /* ---------------------------------------------------------------------- */

  private input(
    block: Blockly.Block,
    name: string,
  ): Lisp | null {
    const target = block.getInputTargetBlock(name);

    if (!target) {
      return null;
    }

    return this.blockToLisp(target);
  }

  private statementList(
    block: Blockly.Block,
    name: string,
  ): Lisp {
    const first = block.getInputTargetBlock(name);

    const result: Lisp[] = [];

    let current: Blockly.Block | null = first;

    while (current) {
      const expression = this.blockToLisp(current);

      if (expression !== null) {
        result.push(expression);
      }

      current = current.getNextBlock();
    }

    return [
      'begin',
      ...result,
    ];
  }

  private generateIf(
    block: Blockly.Block,
  ): Lisp {
    const result: Lisp[] = [
      'if',
    ];

    let branch = 0;

    while (true) {
      const condition =
        this.input(block, `IF${branch}`);

      const body =
        this.statementList(block, `DO${branch}`);

      if (condition === null) {
        break;
      }

      result.push(condition);
      result.push(body);

      branch++;
    }

    const elseBody =
      this.statementList(block, 'ELSE');

    if (elseBody.length > 1) {
      result.push(elseBody);
    }

    return result;
  }

  private blockInputs(
    block: Blockly.Block,
  ): Lisp {
    const inputs: Lisp[] = [];

    for (const input of block.inputList) {
      if (!input.name) {
        continue;
      }

      const value =
        this.input(block, input.name);

      if (value !== null) {
        inputs.push([
          this.symbol(input.name),
          value ?? 'nil',
        ]);
      }
    }

    return inputs;
  }

  private symbol(value: string): string {
    return String(value)
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9_!?*+/<>=-]/g, '-')
      .toLowerCase();
  }

  private escapeString(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }
}

/* -------------------------------------------------------------------------- */
/* Singleton                                                                   */
/* -------------------------------------------------------------------------- */

export const lispGenerator = new LispGenerator();

/* -------------------------------------------------------------------------- */
/* Convenience API                                                             */
/* -------------------------------------------------------------------------- */

export function workspaceToLisp(
  workspace: Blockly.Workspace,
): string {
  return lispGenerator.workspaceToCode(workspace);
}

export default lispGenerator;
```
