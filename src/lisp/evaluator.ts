```ts
/**
 * Leibniz Lisp Evaluator
 *
 * A minimal, self-contained Lisp runtime for the Leibniz IR.
 *
 * Pipeline:
 *
 *     Blockly
 *        ↓
 *     Lisp AST
 *        ↓
 *     Evaluator
 *        ↓
 *     Value
 *
 * The evaluator is intentionally small.
 * It is designed to become the semantic core of Leibniz.
 */

export type Symbol = {
  readonly type: 'symbol';
  readonly name: string;
};

export type LispValue =
  | number
  | string
  | boolean
  | null
  | LispValue[]
  | Symbol
  | LispFunction;

export type LispFunction = {
  readonly type: 'function';
  readonly call: (
    args: LispValue[],
    evaluator: LispEvaluator,
  ) => LispValue;
};

export class LispError extends Error {
  constructor(message: string) {
    super(`Leibniz Lisp Error: ${message}`);
    this.name = 'LispError';
  }
}

/* -------------------------------------------------------------------------- */
/* Environment                                                                */
/* -------------------------------------------------------------------------- */

export class Environment {
  private readonly values =
    new Map<string, LispValue>();

  constructor(
    private readonly parent?: Environment,
  ) {}

  define(
    name: string,
    value: LispValue,
  ): LispValue {
    this.values.set(name, value);
    return value;
  }

  set(
    name: string,
    value: LispValue,
  ): LispValue {
    if (this.values.has(name)) {
      this.values.set(name, value);
      return value;
    }

    if (this.parent) {
      return this.parent.set(name, value);
    }

    throw new LispError(
      `Undefined variable: ${name}`,
    );
  }

  get(name: string): LispValue {
    if (this.values.has(name)) {
      return this.values.get(name)!;
    }

    if (this.parent) {
      return this.parent.get(name);
    }

    throw new LispError(
      `Undefined variable: ${name}`,
    );
  }

  chil
```
