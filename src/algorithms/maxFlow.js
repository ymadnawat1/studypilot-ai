/**
 * Small Edmonds–Karp max-flow, used ONLY for the exact root feasibility test of
 * the scheduling problem (can every required study unit be placed without
 * violating a hard constraint?). It is not part of BFS / DFS / A* themselves.
 */
export function maxFlow(nodeCount, edges, source, sink) {
  const graph = Array.from({ length: nodeCount }, () => []);
  const to = [];
  const cap = [];
  const addEdge = (u, v, c) => {
    graph[u].push(to.length);
    to.push(v);
    cap.push(c);
    graph[v].push(to.length);
    to.push(u);
    cap.push(0);
  };
  for (const [u, v, c] of edges) addEdge(u, v, c);

  let flow = 0;
  for (;;) {
    const prevEdge = new Array(nodeCount).fill(-1);
    const visited = new Array(nodeCount).fill(false);
    visited[source] = true;
    const queue = [source];
    let head = 0;
    while (head < queue.length && !visited[sink]) {
      const u = queue[head++];
      for (const e of graph[u]) {
        const v = to[e];
        if (!visited[v] && cap[e] > 0) {
          visited[v] = true;
          prevEdge[v] = e;
          queue.push(v);
        }
      }
    }
    if (!visited[sink]) break;

    let bottleneck = Infinity;
    for (let v = sink; v !== source; v = to[prevEdge[v] ^ 1]) {
      bottleneck = Math.min(bottleneck, cap[prevEdge[v]]);
    }
    for (let v = sink; v !== source; v = to[prevEdge[v] ^ 1]) {
      cap[prevEdge[v]] -= bottleneck;
      cap[prevEdge[v] ^ 1] += bottleneck;
    }
    flow += bottleneck;
  }
  return flow;
}
