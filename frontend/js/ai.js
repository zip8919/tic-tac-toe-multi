// AI 占位：随机落子

// 延迟模拟思考时间
function delay(ms = 300) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getAIMove(getValidMoves, board, context) {
  await delay(300 + Math.random() * 400);
  const moves = getValidMoves(board, context);
  if (moves.length === 0) return null;
  const idx = Math.floor(Math.random() * moves.length);
  return moves[idx];
}
