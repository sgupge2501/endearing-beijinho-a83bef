window.onload = function() {
    // --- 1. データと状態の初期化 ---
    const defaultBodyParts = [
        { name: "脚", priority: 1, recoveryHours: 72, exercises: [
            { name: "スクワット", rest: 180 }, { name: "レッグプレス", rest: 150 }, { name: "レッグエクステンション", rest: 60 }
        ]},
        { name: "背中", priority: 2, recoveryHours: 72, exercises: [
            { name: "懸垂", rest: 120 }, { name: "ラットプルダウン", rest: 90 }, { name: "ワンハンドロー", rest: 90 }
        ]},
        { name: "胸", priority: 3, recoveryHours: 48, exercises: [
            { name: "ベンチプレス", rest: 150 }, { name: "インクラインプレス", rest: 120 }, { name: "ダンベルフライ", rest: 90 }
        ]},
        { name: "肩", priority: 4, recoveryHours: 48, exercises: [
            { name: "ショルダープレス", rest: 120 }, { name: "サイドレイズ", rest: 45 }, { name: "リアレイズ", rest: 45 }
        ]},
        { name: "腕", priority: 5, recoveryHours: 24, exercises: [
            { name: "アームカール", rest: 60 }, { name: "プレスダウン", rest: 60 }
        ]},
        { name: "腹筋", priority: 6, recoveryHours: 24, exercises: [
            { name: "クランチ", rest: 45 }, { name: "レッグレイズ", rest: 45 }
        ]}
    ];

    let savedBodyParts = JSON.parse(localStorage.getItem('masterBodyParts'));
    let bodyParts;
    if (!savedBodyParts) {
        bodyParts = defaultBodyParts;
    } else {
        bodyParts = defaultBodyParts.map(defPart => {
            const savedPart = savedBodyParts.find(sp => sp.name === defPart.name);
            if (!savedPart) return defPart;
            const userAddedExercises = savedPart.exercises.filter(se => !defPart.exercises.some(de => de.name === se.name));
            return { ...defPart, exercises: [...defPart.exercises, ...userAddedExercises] };
        });
        const customParts = savedBodyParts.filter(sp => !defaultBodyParts.some(dp => dp.name === sp.name));
        bodyParts = [...bodyParts, ...customParts];
        localStorage.setItem('masterBodyParts', JSON.stringify(bodyParts));
    }

    let recoveryData = JSON.parse(localStorage.getItem('recoveryData')) || {}; 
    let exerciseRecords = JSON.parse(localStorage.getItem('exerciseRecords')) || {}; 
    let streakData = JSON.parse(localStorage.getItem('streakData')) || { lastDate: null, count: 0 };
    
    // 追加: 種目ごとの最終実施日時を記録するデータ
    let exerciseLastDate = JSON.parse(localStorage.getItem('exerciseLastDate')) || {};

    let selectedParts = new Set();
    let currentProcessingPart = null;
    let currentExerciseObj = null; 
    let currentExerciseSets = [];
    let totalVolumeThisSession = 0;
    let allSessionSets = []; 
    let doneExercisesInCurrentPart = []; 

    let timerInterval = null, workoutInterval = null;
    let baseTime = 60, rpeModifier = 1.0, setNumber = 1;
    let targetEndTime = 0; 

    // マイナス入力を防ぐ関数
    const preventMinus = (e) => {
        if (e.key === '-' || e.key === 'e') {
            e.preventDefault();
        }
    };

    const weightInput = document.getElementById('actual-weight');
    const repsInput = document.getElementById('actual-reps');
    weightInput.onkeydown = preventMinus;
    repsInput.onkeydown = preventMinus;

    const buttonGrid = document.getElementById('button-grid');
    const startBtn = document.getElementById('start-roulette');
    const selectionScreen = document.getElementById('selection-screen');
    const rouletteScreen = document.getElementById('roulette-screen');
    const selectedList = document.getElementById('selected-list');
    const resultArea = document.getElementById('roulette-result-area');
    const resultText = document.getElementById('result-exercise-name');
    const timerDisplay = document.getElementById('timer-display');
    const setStartBtn = document.getElementById('set-start-btn');
    const skipRestBtn = document.getElementById('skip-rest-btn');
    const recordInputArea = document.getElementById('record-input-area');
    const workoutStatus = document.getElementById('workout-status');
    const lastSetsList = document.getElementById('last-sets-list');
    const inlineEditArea = document.getElementById('inline-edit-area');
    const editExerciseList = document.getElementById('edit-exercise-list');
    const streakInfo = document.getElementById('streak-info');
    const recommendArea = document.getElementById('recommend-area');
    const selectReadyPartsBtn = document.getElementById('select-ready-parts-btn');
    const exerciseMemo = document.getElementById('exercise-memo'); 

    // 音声アラーム関数 (Web Audio API)
    function playAlarm() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime + i * 0.4); 
            
            gainNode.gain.setValueAtTime(0.5, ctx.currentTime + i * 0.4);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.4 + 0.2);
            
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            osc.start(ctx.currentTime + i * 0.4);
            osc.stop(ctx.currentTime + i * 0.4 + 0.2);
        }
    }

    exerciseMemo.addEventListener('input', (e) => {
        if (currentExerciseObj) {
            localStorage.setItem(`memo_${currentExerciseObj.name}`, e.target.value);
        }
    });

    function updateStreak() {
        const today = new Date().toLocaleDateString();
        if (streakData.lastDate && streakData.lastDate !== today) {
            const last = new Date(streakData.lastDate);
            const diffDays = Math.ceil(Math.abs(new Date(today) - last) / (1000 * 60 * 60 * 24));
            if (diffDays > 1) streakData.count = 0; 
        }
        if (streakData.count > 0) {
            streakInfo.style.display = 'inline-block';
            streakInfo.innerText = `🔥 ${streakData.count}日連続中！`;
        }
    }

    function initButtons() {
        buttonGrid.innerHTML = "";
        const now = Date.now();
        let readyPartsFound = [];
        bodyParts.forEach(part => {
            const wrapper = document.createElement('div');
            wrapper.className = 'part-card-wrapper';
            const btn = document.createElement('button');
            btn.className = 'part-btn card';
            const finishTime = recoveryData[part.name] || 0;
            const remainingMs = finishTime - now;
            const progress = Math.max(0, Math.min(100, (1 - (remainingMs / (part.recoveryHours * 3600000))) * 100));
            let timeLabel = "READY";
            if (remainingMs > 0) {
                const h = Math.floor(remainingMs / 3600000);
                const m = Math.floor((remainingMs % 3600000) / 60000);
                timeLabel = h > 0 ? `残り ${h}h ${m}m` : `残り ${m}m`;
                btn.classList.add('recovering');
            } else { readyPartsFound.push(part); }
            btn.innerHTML = `<span class="part-name">${part.name}</span><div class="progress-container"><div class="progress-bar"><div class="progress-fill ${remainingMs <= 0 ? 'ready-fill' : ''}" style="width: ${progress}%"></div></div><span class="time-label">${timeLabel}</span></div>`;
            btn.onclick = () => {
                btn.classList.toggle('selected');
                if (btn.classList.contains('selected')) selectedParts.add(part);
                else selectedParts = new Set(Array.from(selectedParts).filter(p => p.name !== part.name));
            };
            const editBtn = document.createElement('button');
            editBtn.className = 'edit-icon-btn'; editBtn.innerHTML = '⚙️';
            editBtn.onclick = (e) => { e.stopPropagation(); openInlineEdit(part); };
            wrapper.append(btn, editBtn);
            buttonGrid.appendChild(wrapper);
        });
        recommendArea.style.display = readyPartsFound.length > 0 ? 'block' : 'none';
        selectReadyPartsBtn.onclick = () => {
            readyPartsFound.forEach(p => {
                selectedParts.add(p);
                document.querySelectorAll('.part-btn').forEach(b => {
                    if(b.querySelector('.part-name').innerText === p.name) b.classList.add('selected');
                });
            });
        };
    }

    function openInlineEdit(part) {
        currentEditingPart = part;
        document.getElementById('edit-part-title').innerText = `${part.name}の管理`;
        renderEditList();
        inlineEditArea.style.display = 'block';
    }

    function renderEditList() {
        editExerciseList.innerHTML = "";
        currentEditingPart.exercises.forEach((ex, idx) => {
            const li = document.createElement('li');
            li.innerHTML = `<div class="edit-item-main"><span class="ex-name">${ex.name}</span><input type="number" class="mini-rest-input" value="${ex.rest}" data-idx="${idx}" min="0"><span class="unit">s</span></div><button class="del-btn">×</button>`;
            const input = li.querySelector('.mini-rest-input');
            input.onkeydown = preventMinus; 
            input.onchange = (e) => {
                currentEditingPart.exercises[idx].rest = Math.max(0, parseInt(e.target.value) || 0);
                localStorage.setItem('masterBodyParts', JSON.stringify(bodyParts));
            };
            li.querySelector('.del-btn').onclick = () => {
                if (currentEditingPart.exercises.length > 1) {
                    currentEditingPart.exercises.splice(idx, 1);
                    localStorage.setItem('masterBodyParts', JSON.stringify(bodyParts));
                    renderEditList();
                }
            };
            editExerciseList.appendChild(li);
        });
    }

    document.getElementById('new-exercise-rest').onkeydown = preventMinus;
    document.getElementById('add-exercise-btn').onclick = () => {
        const nameInput = document.getElementById('new-exercise-input');
        const restInput = document.getElementById('new-exercise-rest');
        if (nameInput.value.trim()) {
            currentEditingPart.exercises.push({ name: nameInput.value.trim(), rest: Math.max(0, parseInt(restInput.value) || 60) });
            nameInput.value = ""; restInput.value = "";
            localStorage.setItem('masterBodyParts', JSON.stringify(bodyParts));
            renderEditList();
        }
    };

    startBtn.onclick = () => {
        if (selectedParts.size === 0) return alert("部位を選択してください");
        selectionScreen.style.display = 'none';
        rouletteScreen.style.display = 'block';
        selectedList.innerHTML = "";
        totalVolumeThisSession = 0;
        allSessionSets = []; 
        Array.from(selectedParts).sort((a,b)=>a.priority-b.priority).forEach((part, index) => {
            const div = document.createElement('div');
            div.className = 'workflow-item';
            div.id = `workflow-${part.name}`;
            div.innerHTML = `<div class="list-item-card card"><div class="part-order-badge">STEP ${index + 1}</div><span class="part-name-display">${part.name}</span><button class="spin-btn-small">種目を決定</button></div>${index < selectedParts.size - 1 ? '<div class="workflow-arrow">↓</div>' : ''}`;
            div.querySelector('.spin-btn-small').onclick = (e) => {
                document.querySelectorAll('.executing-badge').forEach(el => el.remove());
                currentProcessingPart = part;
                doneExercisesInCurrentPart = [];
                runRoulette(part, e.target);
            };
            selectedList.appendChild(div);
        });
    };

    function runRoulette(part, btn) {
        if(btn) {
            btn.disabled = true;
            btn.closest('.list-item-card').insertAdjacentHTML('afterbegin', '<span class="executing-badge">NOW</span>');
            btn.style.visibility = 'hidden';
        }
        resultArea.style.display = 'block';
        let count = 0;
        const shuffleInterval = setInterval(() => {
            const tempEx = part.exercises[Math.floor(Math.random() * part.exercises.length)];
            resultText.innerText = tempEx.name;
            count++;
            if (count > 15) {
                clearInterval(shuffleInterval);
                setExercise(part); // ここで重み付きランダムを使って決定
            }
        }, 60);
    }

    function setExercise(part) {
        // 現在のセッションですでにやった種目は除外
        const available = part.exercises.filter(ex => !doneExercisesInCurrentPart.includes(ex.name));
        const targetPool = available.length > 0 ? available : part.exercises;

        // --- ★重み付きランダム抽選（Weighted Random）アルゴリズム ---
        const now = Date.now();
        let totalWeight = 0;
        
        // 1. 各種目の「スコア（重み）」を計算
        const weightedPool = targetPool.map(ex => {
            const lastDate = exerciseLastDate[ex.name] || 0;
            let weight = 100; // 初期値（一度もやっていない種目は最も出やすくする）
            
            if (lastDate > 0) {
                // 最後にやってからの経過日数を計算
                const daysSince = (now - lastDate) / (1000 * 60 * 60 * 24);
                // 経過日数 * 10 をスコアとする（最低1、最高100）
                // 例: 1日経過ならスコア10、10日経過ならスコア100
                weight = Math.max(1, Math.min(100, daysSince * 10));
            }
            
            totalWeight += weight;
            return { ...ex, weight };
        });

        // 2. 合計スコアの範囲で乱数を生成
        let randomValue = Math.random() * totalWeight;
        
        // 3. 乱数からスコアを順番に引いていき、0以下になったら決定
        for (let i = 0; i < weightedPool.length; i++) {
            randomValue -= weightedPool[i].weight;
            if (randomValue <= 0) {
                currentExerciseObj = weightedPool[i];
                break;
            }
        }
        // -------------------------------------------------------------
        
        resultText.innerText = currentExerciseObj.name;
        baseTime = currentExerciseObj.rest; 
        currentExerciseSets = [];
        setNumber = 1;

        exerciseMemo.value = localStorage.getItem(`memo_${currentExerciseObj.name}`) || "";

        const records = exerciseRecords[currentExerciseObj.name] || [];
        lastSetsList.innerHTML = records.length ? "" : "<li>記録なし</li>";
        
        if (records.length > 0) {
            weightInput.value = records[records.length - 1].weight; 
            repsInput.value = records[records.length - 1].reps;
        } else {
            // 記録がない場合は初期化（※マイナス入力は防止済み）
            weightInput.value = "";
            repsInput.value = "";
        }

        records.forEach((rec, idx) => lastSetsList.insertAdjacentHTML('beforeend', `<li><span>Set ${idx+1}</span><strong>${rec.weight}kg × ${rec.reps}回</strong></li>`));
        
        updateUI();
        resultArea.scrollIntoView({ behavior: 'smooth' });
    }

    document.getElementById('set-end-record-btn').onclick = () => {
        clearInterval(workoutInterval);
        const weight = Math.max(0, parseFloat(weightInput.value) || 0);
        const reps = Math.max(0, parseInt(repsInput.value) || 0);
        
        const setLog = { 
            partName: currentProcessingPart.name, 
            exName: currentExerciseObj.name, 
            weight, 
            reps, 
            setNum: currentExerciseSets.length + 1,
            id: Date.now() 
        };

        currentExerciseSets.push(setLog);
        allSessionSets.push(setLog); 
        totalVolumeThisSession += (weight * reps);
        
        // ★記録時に最終実施日時を更新して保存
        exerciseLastDate[currentExerciseObj.name] = Date.now();
        localStorage.setItem('exerciseLastDate', JSON.stringify(exerciseLastDate));

        renderHistoryList();
        document.getElementById('session-history').style.display = "block";
        recordInputArea.style.display = "none";
        document.getElementById('rpe-selection-area').style.display = "block";
    };

    window.deleteLog = function(logId) {
        if(!confirm("この記録を削除しますか？")) return;

        const logToDelete = allSessionSets.find(s => s.id === logId);
        if(!logToDelete) return;

        totalVolumeThisSession -= (logToDelete.weight * logToDelete.reps);

        allSessionSets = allSessionSets.filter(s => s.id !== logId);
        currentExerciseSets = currentExerciseSets.filter(s => s.id !== logId);

        if (currentExerciseSets.length > 0) {
            exerciseRecords[currentExerciseObj.name] = currentExerciseSets.map(s => ({weight: s.weight, reps: s.reps}));
        } else {
            delete exerciseRecords[currentExerciseObj.name];
        }
        localStorage.setItem('exerciseRecords', JSON.stringify(exerciseRecords));

        renderHistoryList();
        
        if(allSessionSets.length === 0) {
            document.getElementById('session-history').style.display = "none";
        }
    };

    function renderHistoryList() {
        const list = document.getElementById('history-list');
        list.innerHTML = "";
        allSessionSets.forEach(set => {
            const li = document.createElement('li');
            li.className = "log-item";
            li.innerHTML = `
                <div class="log-info">
                    <span class="set-badge">Set ${set.setNum}</span>
                    <span>${set.partName}：${set.exName}</span>
                    <strong style="margin-left:10px;">${set.weight}kg × ${set.reps}回</strong>
                </div>
                <button class="del-log-btn" onclick="deleteLog(${set.id})">🗑️</button>
            `;
            list.appendChild(li);
        });
    }

    setStartBtn.onclick = () => {
        clearInterval(timerInterval); clearInterval(workoutInterval);
        setStartBtn.style.display = "none";
        workoutStatus.innerText = "TRAINING";
        workoutStatus.className = "status-badge status-active";
        
        const startTime = Date.now();
        
        workoutInterval = setInterval(() => {
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            timerDisplay.innerText = `${Math.floor(elapsedSeconds/60).toString().padStart(2,'0')}:${(elapsedSeconds%60).toString().padStart(2,'0')}`;
        }, 1000);
        
        recordInputArea.style.display = "block";

        if (currentExerciseSets.length > 0) {
            const lastSet = currentExerciseSets[currentExerciseSets.length - 1];
            weightInput.value = lastSet.weight;
            repsInput.value = lastSet.reps;
        } else {
            const records = exerciseRecords[currentExerciseObj.name] || [];
            if (records.length > 0) {
                weightInput.value = records[records.length - 1].weight;
                repsInput.value = records[records.length - 1].reps;
            }
        }
    };

    document.querySelectorAll('.rpe-btn').forEach(btn => {
        btn.onclick = (e) => {
            rpeModifier = parseFloat(e.target.dataset.mod);
            document.getElementById('rpe-selection-area').style.display = "none";
            startRest();
        };
    });

    function startRest() {
        const restSeconds = Math.round(baseTime * rpeModifier);
        targetEndTime = Date.now() + (restSeconds * 1000);
        
        workoutStatus.innerText = "REST";
        workoutStatus.className = "status-badge status-rest";
        
        if (rpeModifier >= 1.3) {
            workoutStatus.innerText = "DEEP REST";
            workoutStatus.style.backgroundColor = "#ff4444";
        } else {
            workoutStatus.style.backgroundColor = "";
        }

        skipRestBtn.style.display = "block";
        
        timerDisplay.innerText = `${Math.floor(restSeconds/60).toString().padStart(2,'0')}:${(restSeconds%60).toString().padStart(2,'0')}`;

        timerInterval = setInterval(() => {
            const remaining = Math.ceil((targetEndTime - Date.now()) / 1000);
            
            if (remaining <= 0) {
                timerDisplay.innerText = "00:00";
                finishRest();
            } else {
                timerDisplay.innerText = `${Math.floor(remaining/60).toString().padStart(2,'0')}:${(remaining%60).toString().padStart(2,'0')}`;
            }
        }, 1000);
    }
    
    function finishRest() { 
        clearInterval(timerInterval); 
        playAlarm(); 
        setNumber++; 
        updateUI(); 
    }
    
    skipRestBtn.onclick = finishRest;

    function updateUI() {
        document.getElementById('set-counter').innerText = `第 ${setNumber} セット`;
        setStartBtn.style.display = "block";
        skipRestBtn.style.display = "none";
        recordInputArea.style.display = "none";
        workoutStatus.innerText = "READY";
        workoutStatus.className = "status-badge";
        workoutStatus.style.backgroundColor = ""; 
        timerDisplay.innerText = "00:00";
    }

    document.getElementById('next-exercise-btn').onclick = () => {
        saveCurrentExerciseData();
        doneExercisesInCurrentPart.push(currentExerciseObj.name);
        runRoulette(currentProcessingPart, null);
    };

    document.getElementById('complete-part-btn').onclick = () => {
        saveCurrentExerciseData();
        recoveryData[currentProcessingPart.name] = Date.now() + (currentProcessingPart.recoveryHours * 3600000);
        localStorage.setItem('recoveryData', JSON.stringify(recoveryData));
        document.getElementById(`workflow-${currentProcessingPart.name}`).querySelector('.list-item-card').classList.add('completed-item');
        document.getElementById('finish-modal').style.display = "flex";
    };

    function saveCurrentExerciseData() {
        if(currentExerciseSets.length > 0) {
            exerciseRecords[currentExerciseObj.name] = currentExerciseSets.map(s => ({weight: s.weight, reps: s.reps}));
            localStorage.setItem('exerciseRecords', JSON.stringify(exerciseRecords));
        }
    }

    document.getElementById('all-complete-btn').onclick = () => {
        const today = new Date().toLocaleDateString();
        if (streakData.lastDate !== today) {
            streakData.count++; streakData.lastDate = today;
            localStorage.setItem('streakData', JSON.stringify(streakData));
        }
        alert(`ワークアウト終了！総ボリューム: ${totalVolumeThisSession.toLocaleString()}kg`);
        location.reload();
    };

    document.getElementById('close-edit-btn').onclick = () => inlineEditArea.style.display = 'none';
    document.getElementById('modal-close-btn').onclick = () => { document.getElementById('finish-modal').style.display = "none"; resultArea.style.display = "none"; };
    document.getElementById('back-btn').onclick = () => location.reload();
    
    updateStreak();
    initButtons();
};