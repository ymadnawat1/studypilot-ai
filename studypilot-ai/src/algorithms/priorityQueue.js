/**
 * Binary min-heap used as the A* open list.
 *
 * Written from scratch (no external pathfinding / queue libraries).
 * Ties under the user-supplied comparator are broken by insertion order
 * (FIFO), which makes every search fully deterministic and reproducible.
 */
export class PriorityQueue {
  /** @param {(a:any,b:any)=>number} compare negative => a has higher priority */
  constructor(compare) {
    this.compare = compare;
    this.heap = [];
    this.seq = 0;
  }

  get size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  _less(i, j) {
    const a = this.heap[i];
    const b = this.heap[j];
    const c = this.compare(a.item, b.item);
    return c !== 0 ? c < 0 : a.seq < b.seq;
  }

  _swap(i, j) {
    const t = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = t;
  }

  push(item) {
    this.heap.push({ item, seq: this.seq++ });
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._less(i, parent)) {
        this._swap(i, parent);
        i = parent;
      } else break;
    }
  }

  peek() {
    return this.heap.length ? this.heap[0].item : undefined;
  }

  pop() {
    const n = this.heap.length;
    if (n === 0) return undefined;
    const top = this.heap[0].item;
    const last = this.heap.pop();
    if (n > 1) {
      this.heap[0] = last;
      let i = 0;
      const len = this.heap.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < len && this._less(l, m)) m = l;
        if (r < len && this._less(r, m)) m = r;
        if (m === i) break;
        this._swap(i, m);
        i = m;
      }
    }
    return top;
  }

  /** Returns the k highest-priority items in order without modifying the queue. */
  topK(k) {
    const copy = new PriorityQueue(this.compare);
    copy.heap = this.heap.slice();
    copy.seq = this.seq;
    const out = [];
    while (out.length < k && !copy.isEmpty()) out.push(copy.pop());
    return out;
  }
}
