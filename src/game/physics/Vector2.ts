/**
 * 2D vector.
 *
 * The plain methods (add, subtract, ...) return new vectors and are used where
 * readability matters. The *InPlace methods mutate and return `this`; they are used on
 * the physics hot path so a sub-stepped tick doesn't allocate.
 */
export class Vector2 {
  x: number;
  y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  static lerp(
    a: Vector2,
    b: Vector2,
    t: number,
  ): Vector2 {
    return new Vector2(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
    );
  }

  clone(): Vector2 {
    return new Vector2(
      this.x,
      this.y,
    );
  }

  set(
    x: number,
    y: number,
  ): this {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(
    v: Vector2,
  ): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  add(
    v: Vector2,
  ): Vector2 {
    return new Vector2(
      this.x + v.x,
      this.y + v.y,
    );
  }

  subtract(
    v: Vector2,
  ): Vector2 {
    return new Vector2(
      this.x - v.x,
      this.y - v.y,
    );
  }

  multiply(
    scalar: number,
  ): Vector2 {
    return new Vector2(
      this.x * scalar,
      this.y * scalar,
    );
  }

  dot(
    v: Vector2,
  ): number {
    return (
      this.x * v.x +
      this.y * v.y
    );
  }

  magnitude(): number {
    return Math.hypot(
      this.x,
      this.y,
    );
  }

  magnitudeSq(): number {
    return (
      this.x * this.x +
      this.y * this.y
    );
  }

  normalize(): Vector2 {
    const sq =
      this.magnitudeSq();

    if (
      sq <= 1e-18
    ) {
      return new Vector2(
        0,
        0,
      );
    }

    const magnitude =
      Math.sqrt(sq);

    return new Vector2(
      this.x / magnitude,
      this.y / magnitude,
    );
  }

  distanceTo(
    v: Vector2,
  ): number {
    return Math.hypot(
      this.x - v.x,
      this.y - v.y,
    );
  }

  addScaledInPlace(
    v: Vector2,
    scalar: number,
  ): this {
    this.x +=
      v.x * scalar;

    this.y +=
      v.y * scalar;

    return this;
  }

  scaleInPlace(
    scalar: number,
  ): this {
    this.x *= scalar;
    this.y *= scalar;

    return this;
  }

  clampMagnitudeInPlace(
    max: number,
  ): this {
    /*
     * Invalid or non-positive limits produce
     * a zero vector instead of allowing NaN/Infinity
     * to enter the physics simulation.
     */
    if (
      max <= 0
    ) {
      this.x = 0;
      this.y = 0;
      return this;
    }

    const sq =
      this.magnitudeSq();

    const maxSq =
      max * max;

    /*
     * Fast path:
     * no square root or mutation when the vector
     * is already within the allowed magnitude.
     */
    if (
      sq <= maxSq
    ) {
      return this;
    }

    const scale =
      max / Math.sqrt(sq);

    this.x *= scale;
    this.y *= scale;

    return this;
  }
}