// Dice roll animation and calculation

const Dice = (() => {
  let isRolling = false;

  function roll(stat, difficulty, specialAbility = false) {
    return new Promise((resolve) => {
      if (isRolling) return;
      isRolling = true;

      const char = GameState.getCharacter();
      const statValue = char.stats[stat] || 0;
      const d20 = Utils.rollD20();
      const result = Utils.resolveDiceCheck(d20, statValue, difficulty, specialAbility);

      debugLog('GAME_EVT', `Dice roll: d20=${d20} + ${result.bonus} bonus = ${result.total} vs DC ${difficulty} → ${result.passed ? 'PASS' : 'FAIL'}`, result);

      // Animate dice in the story area
      const storyContainer = document.getElementById('story-container');
      if (!storyContainer) {
        isRolling = false;
        resolve(result);
        return;
      }

      // Create dice animation container
      const diceBox = document.createElement('div');
      diceBox.className = 'dice-result';
      diceBox.style.cssText = 'perspective: 400px;';
      storyContainer.appendChild(diceBox);

      // Animate: rolling numbers
      const rollDisplay = document.createElement('div');
      rollDisplay.className = 'dice-result-roll';
      rollDisplay.style.cssText = 'animation: diceRotate 1s ease-out;';
      diceBox.appendChild(rollDisplay);

      let frame = 0;
      const totalFrames = 20;
      const rollInterval = setInterval(() => {
        rollDisplay.textContent = Math.floor(Math.random() * 20) + 1;
        frame++;
        if (frame >= totalFrames) {
          clearInterval(rollInterval);
          // Show final result
          rollDisplay.textContent = d20;
          rollDisplay.style.animation = 'scalePop 500ms ease';

          // Show bonus after a delay
          setTimeout(() => {
            const bonusEl = document.createElement('div');
            bonusEl.className = 'dice-result-bonus';
            bonusEl.textContent = `+ ${result.bonus} bonus = ${result.total}`;
            diceBox.appendChild(bonusEl);

            // Show difficulty
            setTimeout(() => {
              const totalEl = document.createElement('div');
              totalEl.className = 'dice-result-total';
              totalEl.textContent = `vs difficulty ${difficulty} (${Utils.difficultyLabel(difficulty)})`;
              diceBox.appendChild(totalEl);

              // Show verdict
              setTimeout(() => {
                const verdict = document.createElement('div');
                verdict.className = `dice-verdict ${result.passed ? 'success' : 'failure'}`;
                verdict.textContent = result.passed ? 'SUCCESS!' : 'FAILED!';
                diceBox.appendChild(verdict);

                // Flash effect
                if (result.passed) {
                  diceBox.style.animation = 'greenFlash 800ms ease';
                } else {
                  diceBox.style.animation = 'redFlash 800ms ease';
                }

                // Scroll to bottom
                const storyArea = diceBox.closest('.story-area');
                if (storyArea) storyArea.scrollTop = storyArea.scrollHeight;

                isRolling = false;
                setTimeout(() => resolve(result), 500);
              }, 400);
            }, 300);
          }, 400);
        }
      }, 50);

      // Scroll to dice area
      const storyArea = diceBox.closest('.story-area');
      if (storyArea) storyArea.scrollTop = storyArea.scrollHeight;
    });
  }

  function isCurrentlyRolling() {
    return isRolling;
  }

  return { roll, isCurrentlyRolling };
})();
