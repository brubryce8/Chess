import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import "./App.css";

function App() {
  // Main chess game state
  const [game, setGame] = useState(new Chess());
  const [botLevel, setBotLevel] = useState(2);
  const [status, setStatus] = useState("Your move. You are white.");
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [optionSquares, setOptionSquares] = useState({});
  const [lastMove, setLastMove] = useState(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewGame, setReviewGame] = useState(new Chess());
  const [coachMessage, setCoachMessage] = useState("");
  const [dismissedCheckmatePopup, setDismissedCheckmatePopup] = useState(false);

  // Names shown for each bot difficulty level
  const botNames = {
    1: "Random Rookie",
    2: "Beginner Bot",
    3: "Club Bot",
    4: "Tactical Bot",
    5: "Boss Bot",
  };

  // Creates a safe copy of the current chess position
  function safeGameCopy(chess) {
    return new Chess(chess.fen());
  }

  // Clears move dots and selected piece highlights
  function clearMoveHints() {
    setSelectedSquare(null);
    setOptionSquares({});
  }

  // Gives each chess piece a basic score value
  function getPieceValue(piece) {
    if (piece === "p") return 100;
    if (piece === "n") return 320;
    if (piece === "b") return 330;
    if (piece === "r") return 500;
    if (piece === "q") return 900;
    if (piece === "k") return 20000;
    return 0;
  }

  // Scores the board to estimate who is winning
  function evaluateBoard(chess) {
    const board = chess.board();
    let score = 0;

    for (let row = 0; row < board.length; row++) {
      for (let col = 0; col < board[row].length; col++) {
        const square = board[row][col];

        if (square !== null) {
          const value = getPieceValue(square.type);

          if (square.color === "w") {
            score += value;
          } else {
            score -= value;
          }
        }
      }
    }

    if (chess.isCheckmate()) {
      if (chess.turn() === "w") {
        return -999999;
      } else {
        return 999999;
      }
    }

    return score;
  }

  // Sorts stronger-looking moves first so the bot searches better moves earlier
  function orderMoves(moves) {
    const ordered = [...moves];

    ordered.sort(function (a, b) {
      let aScore = 0;
      let bScore = 0;

      if (a.captured) aScore += 10;
      if (b.captured) bScore += 10;

      if (a.promotion) aScore += 8;
      if (b.promotion) bScore += 8;

      if (a.san.includes("+")) aScore += 5;
      if (b.san.includes("+")) bScore += 5;

      if (a.san.includes("#")) aScore += 100;
      if (b.san.includes("#")) bScore += 100;

      return bScore - aScore;
    });

    return ordered;
  }

  // Basic chess bot search algorithm
  function minimax(chess, depth, alpha, beta, isMaximizing) {
    if (depth === 0 || chess.isGameOver()) {
      return evaluateBoard(chess);
    }

    const moves = orderMoves(chess.moves({ verbose: true }));

    if (isMaximizing) {
      let bestScore = -999999;

      for (let i = 0; i < moves.length; i++) {
        chess.move(moves[i]);
        const score = minimax(chess, depth - 1, alpha, beta, false);
        chess.undo();

        if (score > bestScore) {
          bestScore = score;
        }

        if (score > alpha) {
          alpha = score;
        }

        if (beta <= alpha) {
          break;
        }
      }

      return bestScore;
    } else {
      let bestScore = 999999;

      for (let i = 0; i < moves.length; i++) {
        chess.move(moves[i]);
        const score = minimax(chess, depth - 1, alpha, beta, true);
        chess.undo();

        if (score < bestScore) {
          bestScore = score;
        }

        if (score < beta) {
          beta = score;
        }

        if (beta <= alpha) {
          break;
        }
      }

      return bestScore;
    }
  }

  // Finds the best move the bot can see at a certain search depth
  function getBestMove(chess, depth) {
    const moves = orderMoves(chess.moves({ verbose: true }));

    if (moves.length === 0) {
      return null;
    }

    let bestMove = moves[0];

    if (chess.turn() === "w") {
      let bestScore = -999999;

      for (let i = 0; i < moves.length; i++) {
        chess.move(moves[i]);
        const score = minimax(chess, depth - 1, -999999, 999999, false);
        chess.undo();

        if (score > bestScore) {
          bestScore = score;
          bestMove = moves[i];
        }
      }
    } else {
      let bestScore = 999999;

      for (let i = 0; i < moves.length; i++) {
        chess.move(moves[i]);
        const score = minimax(chess, depth - 1, -999999, 999999, true);
        chess.undo();

        if (score < bestScore) {
          bestScore = score;
          bestMove = moves[i];
        }
      }
    }

    return bestMove;
  }

  // Scores what the board would look like after a move
  function getMoveScore(chess, move, depth) {
    chess.move(move);
    const score = minimax(chess, depth - 1, -999999, 999999, chess.turn() === "w");
    chess.undo();
    return score;
  }

  // Labels the user's move as Best, Good, Inaccuracy, Mistake, or Blunder
  function classifyMove(beforeFen, playedMove, bestMove) {
    const temp = new Chess(beforeFen);

    if (bestMove === null) {
      return {
        label: "Book",
        className: "quality-book",
        message: "Opening or forced move.",
      };
    }

    const sameMove =
      playedMove.from === bestMove.from &&
      playedMove.to === bestMove.to &&
      (playedMove.promotion || "") === (bestMove.promotion || "");

    if (sameMove) {
      return {
        label: "Best",
        className: "quality-best",
        message: "Great move. That was the engine's top choice.",
      };
    }

    const bestScore = getMoveScore(temp, bestMove, 2);
    const playedScore = getMoveScore(temp, playedMove, 2);

    let difference = 0;

    if (temp.turn() === "w") {
      difference = bestScore - playedScore;
    } else {
      difference = playedScore - bestScore;
    }

    if (difference < 80) {
      return {
        label: "Good",
        className: "quality-good",
        message: "Good move. There was a slightly better option, but this is playable.",
      };
    }

    if (difference < 200) {
      return {
        label: "Inaccuracy",
        className: "quality-inaccuracy",
        message: "Small mistake. You had a more accurate move available.",
      };
    }

    if (difference < 450) {
      return {
        label: "Mistake",
        className: "quality-mistake",
        message: "This move loses some advantage. Look at the suggested move.",
      };
    }

    return {
      label: "Blunder",
      className: "quality-blunder",
      message: "Big mistake. The suggested move was much stronger.",
    };
  }

  // Picks a bot move based on the selected difficulty level
  function getBotMove(chess) {
    const moves = chess.moves({ verbose: true });

    if (moves.length === 0) {
      return null;
    }

    if (botLevel === 1) {
      const randomIndex = Math.floor(Math.random() * moves.length);
      return moves[randomIndex];
    }

    if (botLevel === 2) {
      if (Math.random() < 0.45) {
        const randomIndex = Math.floor(Math.random() * moves.length);
        return moves[randomIndex];
      }

      return getBestMove(chess, 1);
    }

    if (botLevel === 3) {
      if (Math.random() < 0.25) {
        const randomIndex = Math.floor(Math.random() * moves.length);
        return moves[randomIndex];
      }

      return getBestMove(chess, 1);
    }

    if (botLevel === 4) {
      return getBestMove(chess, 2);
    }

    return getBestMove(chess, 3);
  }

  // Updates the status message after each move
  function updateStatus(chess) {
    if (chess.isCheckmate()) {
      clearMoveHints();

      if (chess.turn() === "w") {
        setStatus("Checkmate. Bot wins.");
      } else {
        setStatus("Checkmate! You win!");
      }
    } else if (chess.isDraw()) {
      clearMoveHints();
      setStatus("Draw.");
    } else if (chess.isStalemate()) {
      clearMoveHints();
      setStatus("Stalemate.");
    } else if (chess.inCheck()) {
      if (chess.turn() === "w") {
        setStatus("You are in check.");
      } else {
        setStatus("Bot is in check.");
      }
    } else if (chess.turn() === "w") {
      setStatus("Your move.");
    } else {
      setStatus("Bot is thinking...");
    }
  }

  // Makes the bot move after the user moves
  function makeBotMove(chessAfterUserMove, currentHistory) {
    window.setTimeout(function () {
      const botGame = safeGameCopy(chessAfterUserMove);

      if (botGame.isGameOver()) {
        clearMoveHints();
        updateStatus(botGame);
        return;
      }

      const beforeFen = botGame.fen();
      const botMove = getBotMove(botGame);

      if (botMove === null) {
        clearMoveHints();
        updateStatus(botGame);
        return;
      }

      const played = botGame.move(botMove);
      const afterFen = botGame.fen();

      const newBotRecord = {
        player: "bot",
        moveNumber: Math.ceil((currentHistory.length + 1) / 2),
        san: played.san,
        from: played.from,
        to: played.to,
        beforeFen: beforeFen,
        afterFen: afterFen,
        bestMove: null,
        quality: {
          label: "Bot",
          className: "quality-bot",
          message: "Bot move.",
        },
      };

      const newHistory = [...currentHistory, newBotRecord];

      clearMoveHints();
      setMoveHistory(newHistory);
      setGame(safeGameCopy(botGame));
      setLastMove({ from: played.from, to: played.to });
      updateStatus(botGame);
    }, 500);
  }

  // Shows possible move dots when the user drags a piece
  function getMoveOptions(square) {
    if (reviewMode || game.isGameOver() || game.turn() !== "w") {
      clearMoveHints();
      return;
    }

    const piece = game.get(square);

    if (!piece || piece.color !== "w") {
      clearMoveHints();
      return;
    }

    const moves = game.moves({
      square: square,
      verbose: true,
    });

    const newSquares = {};

    for (let i = 0; i < moves.length; i++) {
      newSquares[moves[i].to] = {
        background:
          game.get(moves[i].to) && game.get(moves[i].to).color !== game.get(square).color
            ? "radial-gradient(circle, rgba(255,80,80,.8) 35%, transparent 38%)"
            : "radial-gradient(circle, rgba(40,40,40,.35) 22%, transparent 24%)",
        borderRadius: "50%",
      };
    }

    newSquares[square] = {
      background: "rgba(255, 255, 0, 0.35)",
    };

    setOptionSquares(newSquares);
  }

  // Handles click-to-move controls
  function onSquareClick(square) {
    if (!square) {
      return;
    }

    if (reviewMode || game.isGameOver()) {
      clearMoveHints();
      return;
    }

    if (game.turn() !== "w") {
      clearMoveHints();
      return;
    }

    const piece = game.get(square);

    if (selectedSquare === null) {
      if (piece && piece.color === "w") {
        setSelectedSquare(square);
      } else {
        clearMoveHints();
      }

      return;
    }

    const moveWorked = makeUserMove(selectedSquare, square);

    if (!moveWorked) {
      if (piece && piece.color === "w") {
        setSelectedSquare(square);
      } else {
        clearMoveHints();
      }
    } else {
      clearMoveHints();
    }
  }

  // Handles drag-and-drop piece movement
  function onDrop(sourceSquare, targetSquare) {
    clearMoveHints();

    if (!sourceSquare || !targetSquare) {
      return false;
    }

    if (reviewMode || game.isGameOver()) {
      return false;
    }

    if (game.turn() !== "w") {
      return false;
    }

    const moved = makeUserMove(sourceSquare, targetSquare);

    clearMoveHints();

    return moved;
  }

  // Reads the dropped piece position from react-chessboard
  function handlePieceDrop(arg1, arg2) {
    let sourceSquare = "";
    let targetSquare = "";

    if (typeof arg1 === "object" && arg1 !== null) {
      sourceSquare = arg1.sourceSquare;
      targetSquare = arg1.targetSquare;
    } else {
      sourceSquare = arg1;
      targetSquare = arg2;
    }

    return onDrop(sourceSquare, targetSquare);
  }

  // Shows possible moves while dragging a piece
  function handlePieceDrag(arg1) {
    let sourceSquare = "";

    if (typeof arg1 === "object" && arg1 !== null) {
      sourceSquare = arg1.square || "";
    }

    if (!sourceSquare) {
      return;
    }

    getMoveOptions(sourceSquare);
  }

  // Reads clicked square information from react-chessboard
  function handleSquareClick(arg1) {
    let square = "";

    if (typeof arg1 === "object" && arg1 !== null) {
      square = arg1.square;
    } else {
      square = arg1;
    }

    onSquareClick(square);
  }

  // Makes the user's move and saves it for review mode
  function makeUserMove(sourceSquare, targetSquare) {
    const newGame = safeGameCopy(game);
    const bestMoveBeforeUserMove = getBestMove(newGame, 2);
    const beforeFen = newGame.fen();

    let move = null;

    try {
      move = newGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });
    } catch {
      move = null;
    }

    if (move === null) {
      return false;
    }

    const quality = classifyMove(beforeFen, move, bestMoveBeforeUserMove);

    const userRecord = {
      player: "user",
      moveNumber: Math.ceil((moveHistory.length + 1) / 2),
      san: move.san,
      from: move.from,
      to: move.to,
      beforeFen: beforeFen,
      afterFen: newGame.fen(),
      bestMove: bestMoveBeforeUserMove,
      quality: quality,
    };

    const newHistory = [...moveHistory, userRecord];

    clearMoveHints();
    setDismissedCheckmatePopup(false);
    setMoveHistory(newHistory);
    setGame(safeGameCopy(newGame));
    setLastMove({ from: move.from, to: move.to });
    setCoachMessage(`${quality.label}: ${quality.message}`);

    updateStatus(newGame);

    if (!newGame.isGameOver()) {
      makeBotMove(newGame, newHistory);
    }

    return true;
  }

  // Starts a completely new game
  function resetGame() {
    const freshGame = new Chess();

    setGame(freshGame);
    setMoveHistory([]);
    setStatus("Your move. You are white.");
    setSelectedSquare(null);
    setOptionSquares({});
    setLastMove(null);
    setReviewMode(false);
    setReviewIndex(0);
    setReviewGame(new Chess());
    setCoachMessage("");
    setDismissedCheckmatePopup(false);
  }

  // Starts the move-by-move coaching review
  function startReview() {
    if (moveHistory.length === 0) {
      return;
    }

    clearMoveHints();

    const freshReview = new Chess();
    setReviewGame(freshReview);
    setReviewIndex(0);
    setReviewMode(true);
    setDismissedCheckmatePopup(true);

    const firstMove = moveHistory[0];

    if (firstMove.player === "user") {
      setCoachMessage(getReviewMessage(firstMove));
    } else {
      setCoachMessage("Review started.");
    }
  }

  // Leaves review mode and returns to the current game board
  function exitReview() {
    clearMoveHints();
    setReviewMode(false);
    setCoachMessage("");
  }

  // Jumps to a specific move during review mode
  function goToReviewMove(index) {
    const review = new Chess();

    for (let i = 0; i <= index; i++) {
      const item = moveHistory[i];

      try {
        review.move({
          from: item.from,
          to: item.to,
          promotion: "q",
        });
      } catch {
        // Keeps the app from crashing if a move cannot replay.
      }
    }

    clearMoveHints();
    setReviewGame(review);
    setReviewIndex(index);

    const item = moveHistory[index];
    setLastMove({ from: item.from, to: item.to });
    setCoachMessage(getReviewMessage(item));
  }

  // Goes forward one move in review mode
  function nextReviewMove() {
    if (reviewIndex < moveHistory.length - 1) {
      goToReviewMove(reviewIndex + 1);
    }
  }

  // Goes back one move in review mode
  function previousReviewMove() {
    if (reviewIndex > 0) {
      goToReviewMove(reviewIndex - 1);
    } else {
      clearMoveHints();
      setReviewGame(new Chess());
      setReviewIndex(0);
      setCoachMessage("Back to starting position.");
    }
  }

  // Creates the coaching message for the current reviewed move
  function getReviewMessage(item) {
    if (!item) {
      return "";
    }

    if (item.player === "bot") {
      return `Bot played ${item.san}.`;
    }

    if (item.quality.label === "Best") {
      return `Move ${item.moveNumber}: ${item.san} was the best move. Nice job.`;
    }

    if (item.bestMove) {
      return `Move ${item.moveNumber}: ${item.san} was a ${item.quality.label}. Better was ${item.bestMove.san}.`;
    }

    return `Move ${item.moveNumber}: ${item.san}.`;
  }

  // Chooses whether to show the live game board or the review board
  const currentBoardGame = reviewMode ? reviewGame : game;

  // Finds the king so it can be highlighted when in check
  function findKingSquare(chess, color) {
    const board = chess.board();

    for (let row = 0; row < board.length; row++) {
      for (let col = 0; col < board[row].length; col++) {
        const piece = board[row][col];

        if (piece && piece.type === "k" && piece.color === color) {
          const file = String.fromCharCode(97 + col);
          const rank = 8 - row;
          return file + rank;
        }
      }
    }

    return null;
  }

  // Combines move dots, last move highlights, and check highlights
  const boardStyles = useMemo(
    function () {
      const styles = { ...optionSquares };

      if (lastMove) {
        styles[lastMove.from] = {
          ...styles[lastMove.from],
          background: "rgba(255, 255, 0, 0.35)",
        };

        styles[lastMove.to] = {
          ...styles[lastMove.to],
          background: "rgba(255, 255, 0, 0.45)",
        };
      }

      const kingSquare = findKingSquare(currentBoardGame, currentBoardGame.turn());

      if (kingSquare && currentBoardGame.inCheck()) {
        styles[kingSquare] = {
          ...styles[kingSquare],
          background:
            "radial-gradient(circle, rgba(255,0,0,.75) 35%, rgba(255,0,0,.25) 70%)",
        };
      }

      return styles;
    },
    [optionSquares, lastMove, currentBoardGame]
  );

  // Controls the height of the evaluation bar
  function getEvalBarHeight() {
    const score = evaluateBoard(currentBoardGame);
    let percent = 50 + score / 40;

    if (percent > 95) percent = 95;
    if (percent < 5) percent = 5;

    return percent;
  }

  // Creates arrows for review mode
  function getReviewArrows() {
    if (!reviewMode || moveHistory.length === 0) {
      return [];
    }

    const item = moveHistory[reviewIndex];

    if (!item) {
      return [];
    }

    const arrows = [];

    arrows.push({
      startSquare: item.from,
      endSquare: item.to,
      color: "rgba(255, 215, 0, 0.85)",
    });

    if (item.player === "user" && item.bestMove && item.quality.label !== "Best") {
      arrows.push({
        startSquare: item.bestMove.from,
        endSquare: item.bestMove.to,
        color: "rgba(0, 200, 90, 0.9)",
      });
    }

    return arrows;
  }

  // Displays the move history list
  function renderMoveList() {
    const rows = [];

    for (let i = 0; i < moveHistory.length; i += 2) {
      const whiteMove = moveHistory[i];
      const blackMove = moveHistory[i + 1];

      rows.push(
        <div className="move-row" key={i}>
          <div className="move-number">{whiteMove.moveNumber}.</div>

          <button
            className={reviewMode && reviewIndex === i ? "move-button active-move" : "move-button"}
            onClick={function () {
              if (reviewMode) {
                goToReviewMove(i);
              }
            }}
          >
            {whiteMove.san}
          </button>

          {blackMove ? (
            <button
              className={
                reviewMode && reviewIndex === i + 1 ? "move-button active-move" : "move-button"
              }
              onClick={function () {
                if (reviewMode) {
                  goToReviewMove(i + 1);
                }
              }}
            >
              {blackMove.san}
            </button>
          ) : (
            <div></div>
          )}
        </div>
      );
    }

    return rows;
  }

  // Creates the checkmate popup title
  function getCheckmateTitle() {
    if (!game.isCheckmate()) {
      return "";
    }

    if (game.turn() === "w") {
      return "Checkmate — Bot Wins";
    }

    return "Checkmate — You Win!";
  }

  // Creates the checkmate popup message
  function getCheckmateMessage() {
    if (!game.isCheckmate()) {
      return "";
    }

    if (game.turn() === "w") {
      return "The bot trapped your king. Start the review to see where the game changed.";
    }

    return "Nice job! You checkmated the bot. Start the review to see your best moves.";
  }

  // Current reviewed move and checkmate popup visibility
  const currentReviewItem = reviewMode ? moveHistory[reviewIndex] : null;
  const showCheckmatePopup = game.isCheckmate() && !reviewMode && !dismissedCheckmatePopup;

  // Main app layout
  return (
    <div className="app">
      <div className="background-glow"></div>

      {showCheckmatePopup && (
        <div className="checkmate-overlay">
          <div className="checkmate-modal">
            <div className="checkmate-icon">♛</div>
            <h2>{getCheckmateTitle()}</h2>
            <p>{getCheckmateMessage()}</p>

            <div className="checkmate-actions">
              <button className="review-button" onClick={startReview}>
                Start Game Review
              </button>

              <button className="new-game-button" onClick={resetGame}>
                New Game
              </button>

              <button
                className="close-popup-button"
                onClick={function () {
                  setDismissedCheckmatePopup(true);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="top-bar">
        <div>
          <h1>Chess Coach</h1>
          <p>Play bots. Review mistakes. Learn better moves.</p>
        </div>

        <button className="new-game-button" onClick={resetGame}>
          New Game
        </button>
      </header>

      <main className="main-layout">
        <section className="left-panel">
          <div className="bot-card">
            <div className="bot-avatar">♟️</div>
            <div>
              <h2>{botNames[botLevel]}</h2>
              <p>Level {botLevel} bot</p>
            </div>
          </div>

          <label className="level-label">Bot Level</label>

          <select
            className="level-select"
            value={botLevel}
            disabled={moveHistory.length > 0 || reviewMode}
            onChange={function (event) {
              setBotLevel(Number(event.target.value));
            }}
          >
            <option value={1}>Level 1 - Random Rookie</option>
            <option value={2}>Level 2 - Beginner Bot</option>
            <option value={3}>Level 3 - Club Bot</option>
            <option value={4}>Level 4 - Tactical Bot</option>
            <option value={5}>Level 5 - Boss Bot</option>
          </select>

          <div className="status-box">
            <span>Status</span>
            <strong>{reviewMode ? "Review Mode" : status}</strong>
          </div>

          <div className="coach-box">
            <span>Coach</span>
            <p>
              {coachMessage ||
                "After your moves, I will label them as Best, Good, Inaccuracy, Mistake, or Blunder."}
            </p>
          </div>

          {game.isGameOver() && !reviewMode && (
            <button className="review-button pulse" onClick={startReview}>
              Start Game Review
            </button>
          )}

          {!game.isGameOver() && moveHistory.length > 0 && !reviewMode && (
            <button className="review-button" onClick={startReview}>
              Review Current Game
            </button>
          )}

          {reviewMode && (
            <button className="exit-review-button" onClick={exitReview}>
              Exit Review
            </button>
          )}
        </section>

        <section className="board-section">
          <div className="board-card">
            <div className="eval-bar">
              <div className="eval-white" style={{ height: `${getEvalBarHeight()}%` }}></div>
            </div>

            <div className="board-wrap">
              <div style={{ width: "560px", maxWidth: "100%" }}>
                <Chessboard
                  options={{
                    position: currentBoardGame.fen(),
                    onPieceDrop: handlePieceDrop,
                    onPieceDrag: handlePieceDrag,
                    onSquareClick: handleSquareClick,
                    allowDragging: !reviewMode && !game.isGameOver(),
                    squareStyles: boardStyles,
                    arrows: getReviewArrows(),
                    animationDurationInMs: 250,
                    boardStyle: {
                      borderRadius: "16px",
                      boxShadow: "0 18px 50px rgba(0, 0, 0, 0.45)",
                    },
                    darkSquareStyle: { backgroundColor: "#769656" },
                    lightSquareStyle: { backgroundColor: "#eeeed2" },
                  }}
                />
              </div>
            </div>
          </div>

          {reviewMode && (
            <div className="review-controls">
              <button onClick={previousReviewMove}>← Previous</button>

              <div className="review-center">
                <strong>
                  Move {reviewIndex + 1} of {moveHistory.length}
                </strong>

                {currentReviewItem && currentReviewItem.player === "user" && (
                  <span className={`quality-pill ${currentReviewItem.quality.className}`}>
                    {currentReviewItem.quality.label}
                  </span>
                )}
              </div>

              <button onClick={nextReviewMove}>Next →</button>
            </div>
          )}
        </section>

        <section className="right-panel">
          <div className="moves-card">
            <div className="moves-header">
              <h2>Moves</h2>
              <span>{moveHistory.length} moves</span>
            </div>

            <div className="move-list">
              {moveHistory.length === 0 ? (
                <p className="empty-moves">No moves yet.</p>
              ) : (
                renderMoveList()
              )}
            </div>
          </div>

          <div className="review-card">
            <h2>Review Guide</h2>

            <div className="legend-row">
              <span className="legend-dot best"></span>
              <p>Best move</p>
            </div>

            <div className="legend-row">
              <span className="legend-dot good"></span>
              <p>Good move</p>
            </div>

            <div className="legend-row">
              <span className="legend-dot inaccuracy"></span>
              <p>Inaccuracy</p>
            </div>

            <div className="legend-row">
              <span className="legend-dot mistake"></span>
              <p>Mistake</p>
            </div>

            <div className="legend-row">
              <span className="legend-dot blunder"></span>
              <p>Blunder</p>
            </div>

            <p className="hint">
              In review mode, gold arrow = played move. Green arrow = better move.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;