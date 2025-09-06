document.addEventListener("DOMContentLoaded", () => {
  // Elementos del DOM
  const webcam = document.getElementById("webcam");
  const gameCanvas = document.getElementById("gameCanvas");
  const statusDiv = document.getElementById("status");
  const startButton = document.getElementById("startButton");
  const stopButton = document.getElementById("stopButton");
  const resetButton = document.getElementById("resetButton");
  const teacherModeButton = document.getElementById("teacherModeButton");
  const programContainer = document.getElementById("programContainer");
  const character = document.getElementById("character");
  const objective = document.getElementById("objective");
  const grid = document.getElementById("grid");
  const cameraPlaceholder = document.querySelector(".camera-placeholder");
  const teacherPanel = document.getElementById("teacherPanel");
  const exitTeacherMode = document.getElementById("exitTeacherMode");
  const saveConfigButton = document.getElementById("saveConfigButton");
  const ctx = gameCanvas.getContext("2d");

  // Configuración
  const gridSize = 6;
  let cellSize = 60;
  const videoWidth = 320;
  const videoHeight = 240;

  gameCanvas.width = videoWidth;
  gameCanvas.height = videoHeight;

  // Límites para subida de archivos
  const MAX_FILE_SIZE = 2 * 1024 * 1024;

  // Configuración por defecto
  let config = {
    character: "🤖",
    objective: "⭐",
    startPosition: { x: 0, y: 0 },
    targetPosition: { x: 5, y: 5 },
    customCharacter: null,
    customObjective: null,
  };

  // Mapeo de IDs de marcadores a acciones
  const markerActions = {
    0: { name: "PLAY", icon: "▶️", type: "control" },
    1: { name: "GIRAR_IZQUIERDA", icon: "↰", type: "movement" },
    2: { name: "GIRAR_DERECHA", icon: "↱", type: "movement" },
    3: { name: "ADELANTE", icon: "↑", type: "movement" },
    4: { name: "ATRAS", icon: "↓", type: "movement" },
    5: { name: "EJECUTAR", icon: "🚀", type: "control" },
  };

  // Estado de la aplicación
  let detector;
  let isRunning = false;
  let stream = null;
  let program = [];
  let isWaitingForPlay = true;
  let isExecuting = false;
  let isTeacherMode = false;
  let lastProcessedMarker = { id: -1, time: 0 };
  const markerCooldown = 1000;

  // Estado del personaje
  let characterState = {
    x: 0,
    y: 0,
    rotation: 0,
    gridX: 0,
    gridY: 0,
  };

  // Función para sanitizar texto
  function sanitizeText(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // limpiar programContainer construyendo nodos
  function clearProgramContainer() {
    while (programContainer.firstChild) {
      programContainer.removeChild(programContainer.firstChild);
    }
  }

  function appendProgramLine(text, className, count = 1) {
    const div = document.createElement("div");
    div.className = className || "program-command";

    const textSpan = document.createElement("span");
    textSpan.className = "command-text";
    textSpan.textContent = text;
    div.appendChild(textSpan);

    if (count > 1) {
      const countBadge = document.createElement("span");
      countBadge.className = "count-badge";
      countBadge.textContent = count;
      div.appendChild(countBadge);
    }

    programContainer.appendChild(div);
  }

  //Inicializar la cuadrícula 6x6
  function initializeGrid() {
    grid.innerHTML = "";

    const gridWrapper = document.querySelector(".grid-wrapper");
    const availableWidth = gridWrapper.clientWidth || 360;
    cellSize = Math.floor(availableWidth / gridSize);

    grid.style.width = `${gridSize * cellSize}px`;
    grid.style.height = `${gridSize * cellSize}px`;

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const cell = document.createElement("div");
        cell.className = "grid-cell";
        cell.style.width = `${cellSize}px`;
        cell.style.height = `${cellSize}px`;
        cell.dataset.x = x;
        cell.dataset.y = y;

        cell.addEventListener("dragover", handleDragOver);
        cell.addEventListener("drop", handleDrop);
        cell.addEventListener("dragenter", handleDragEnter);
        cell.addEventListener("dragleave", handleDragLeave);

        grid.appendChild(cell);
      }
    }

    updateCharacterPosition();
    positionObjective(config.targetPosition.x, config.targetPosition.y);
  }

  // Configurar eventos de drag and drop
  function setupDragAndDrop() {
    character.addEventListener("dragstart", handleDragStart);
    character.addEventListener("dragend", handleDragEnd);
    objective.addEventListener("dragstart", handleDragStart);
    objective.addEventListener("dragend", handleDragEnd);
  }

  function handleDragStart(e) {
    this.classList.add("dragging");
    try {
      e.dataTransfer.setData("text/plain", this.id);
      e.dataTransfer.effectAllowed = "move";
    } catch (err) {
      console.warn("Drag start setData falló:", err);
    }
  }

  function handleDragEnd() {
    this.classList.remove("dragging");
    document.querySelectorAll(".grid-cell").forEach((cell) => {
      cell.classList.remove("drag-over");
    });
  }

  function handleDragOver(e) {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch (err) {}
  }

  function handleDragEnter(e) {
    e.preventDefault();
    this.classList.add("drag-over");
  }

  function handleDragLeave() {
    this.classList.remove("drag-over");
  }

  function handleDrop(e) {
    e.preventDefault();
    this.classList.remove("drag-over");

    const elementId = e.dataTransfer.getData("text/plain");
    const element = document.getElementById(elementId);
    const x = parseInt(this.dataset.x, 10);
    const y = parseInt(this.dataset.y, 10);

    if (!element || isNaN(x) || isNaN(y)) return;

    if (elementId === "character") {
      config.startPosition = { x, y };
    } else if (elementId === "objective") {
      config.targetPosition = { x, y };
    }

    positionElement(element, x, y);
  }

  function positionElement(element, x, y) {
    element.style.left = `${x * cellSize + cellSize / 2}px`;
    element.style.top = `${y * cellSize + cellSize / 2}px`;
    element.style.transform = "translate(-50%, -50%)";
  }

  function applyConfiguration() {
    while (character.firstChild) character.removeChild(character.firstChild);
    if (config.customCharacter) {
      const img = document.createElement("img");
      img.src = config.customCharacter;
      img.alt = "Personaje personalizado";
      img.style.width = "40px";
      img.style.height = "40px";
      img.style.objectFit = "contain";
      character.appendChild(img);
    } else {
      character.textContent = config.character;
    }

    while (objective.firstChild) objective.removeChild(objective.firstChild);
    if (config.customObjective) {
      const img = document.createElement("img");
      img.src = config.customObjective;
      img.alt = "Objetivo personalizado";
      img.style.width = "35px";
      img.style.height = "35px";
      img.style.objectFit = "contain";
      objective.appendChild(img);
    } else {
      objective.textContent = config.objective;
    }

    characterState.gridX = config.startPosition.x;
    characterState.gridY = config.startPosition.y;
    characterState.rotation = 0;

    updateCharacterPosition();
    positionObjective(config.targetPosition.x, config.targetPosition.y);

    program = [];
    isWaitingForPlay = true;
    isExecuting = false;
    updateProgramOutput();

    statusDiv.textContent = "ESPERANDO PLAY ▶...";
  }

  function positionObjective(x, y) {
    objective.style.left = `${x * cellSize + cellSize / 2}px`;
    objective.style.top = `${y * cellSize + cellSize / 2}px`;
    objective.style.transform = "translate(-50%, -50%)";
  }

  function updateCharacterPosition() {
    characterState.x = characterState.gridX * cellSize + cellSize / 2;
    characterState.y = characterState.gridY * cellSize + cellSize / 2;

    character.style.left = `${characterState.x}px`;
    character.style.top = `${characterState.y}px`;
    character.style.transform = `translate(-50%, -50%) rotate(${characterState.rotation}deg)`;
  }

  function checkObjectiveReached() {
    return (
      characterState.gridX === config.targetPosition.x &&
      characterState.gridY === config.targetPosition.y
    );
  }

  function moveCharacter() {
    const radians = (characterState.rotation * Math.PI) / 180;
    const moveX = Math.round(Math.cos(radians));
    const moveY = Math.round(Math.sin(radians));

    const newX = characterState.gridX + moveX;
    const newY = characterState.gridY + moveY;

    if (newX >= 0 && newX < gridSize && newY >= 0 && newY < gridSize) {
      characterState.gridX = newX;
      characterState.gridY = newY;
      updateCharacterPosition();
      return true;
    }
    return false;
  }

  function toggleTeacherMode() {
    isTeacherMode = !isTeacherMode;
    teacherPanel.style.display = isTeacherMode ? "block" : "none";
    teacherModeButton.textContent = isTeacherMode
      ? "Modo Estudiante"
      : "Modo Docente";
    teacherModeButton.classList.toggle("btn-teacher-active", isTeacherMode);

    if (isTeacherMode) {
      document.getElementById("characterSelect").value =
        config.character || "🤖";
      document.getElementById("objectiveSelect").value =
        config.objective || "⭐";
    }
  }

  function saveTeacherConfiguration() {
    const charVal = document.getElementById("characterSelect").value;
    const objVal = document.getElementById("objectiveSelect").value;

    config.character = charVal;
    config.objective = objVal;

    applyConfiguration();
    toggleTeacherMode();
  }

  function setupImageUploads() {
    const characterSelect = document.getElementById("characterSelect");
    const objectiveSelect = document.getElementById("objectiveSelect");
    const customCharacterGroup = document.getElementById(
      "customCharacterGroup"
    );
    const customObjectiveGroup = document.getElementById(
      "customObjectiveGroup"
    );
    const customCharacterUpload = document.getElementById(
      "customCharacterUpload"
    );
    const customObjectiveUpload = document.getElementById(
      "customObjectiveUpload"
    );

    characterSelect.addEventListener("change", function () {
      customCharacterGroup.style.display =
        this.value === "custom" ? "block" : "none";
    });

    objectiveSelect.addEventListener("change", function () {
      customObjectiveGroup.style.display =
        this.value === "custom" ? "block" : "none";
    });

    function validateImageFile(file) {
      if (!file) return { ok: false, reason: "No file" };
      if (file.type === "image/svg+xml")
        return { ok: false, reason: "SVG not allowed" };
      if (!(file.type === "image/png" || file.type === "image/jpeg")) {
        return { ok: false, reason: "Only PNG/JPEG allowed" };
      }
      if (file.size > MAX_FILE_SIZE)
        return { ok: false, reason: "File too large" };
      return { ok: true };
    }

    function setCustomImage(file, target) {
      const v = validateImageFile(file);
      if (!v.ok) {
        alert("Error al subir imagen: " + v.reason);
        return;
      }
      if (target === "character" && config.customCharacter) {
        URL.revokeObjectURL(config.customCharacter);
      }
      if (target === "objective" && config.customObjective) {
        URL.revokeObjectURL(config.customObjective);
      }

      const blobUrl = URL.createObjectURL(file);

      if (target === "character") {
        config.customCharacter = blobUrl;
      } else {
        config.customObjective = blobUrl;
      }
      applyConfiguration();
    }

    customCharacterUpload.addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) {
        setCustomImage(e.target.files[0], "character");
      }
    });

    customObjectiveUpload.addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) {
        setCustomImage(e.target.files[0], "objective");
      }
    });
  }

  async function setupCamera() {
    try {
      statusDiv.textContent = "Activando cámara...";
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: videoWidth },
          height: { ideal: videoHeight },
          facingMode: "environment",
        },
      });
      webcam.srcObject = stream;

      webcam.style.display = "block";
      gameCanvas.style.display = "block";
      cameraPlaceholder.style.display = "none";

      return new Promise((resolve) => {
        webcam.onloadedmetadata = () => {
          webcam.play();
          resolve(true);
        };
      });
    } catch (error) {
      console.error("Error al acceder a la cámara:", error);
      statusDiv.textContent =
        "Error: No se pudo acceder a la cámara. Serví esta página desde HTTPS o localhost.";
      cameraPlaceholder.style.display = "block";
      while (cameraPlaceholder.firstChild)
        cameraPlaceholder.removeChild(cameraPlaceholder.firstChild);
      const icon = document.createElement("div");
      icon.className = "camera-icon";
      icon.textContent = "❌";
      const p1 = document.createElement("p");
      p1.textContent = "Error al acceder a la cámara";
      const p2 = document.createElement("p");
      p2.textContent =
        "Asegúrate de servir esta página desde un servidor local o HTTPS";
      cameraPlaceholder.appendChild(icon);
      cameraPlaceholder.appendChild(p1);
      cameraPlaceholder.appendChild(p2);

      return false;
    }
  }

  function initArucoDetector() {
    if (!window.AR || typeof AR.Detector !== "function") {
      statusDiv.textContent =
        "Error: Biblioteca AR no cargada o inválida. Verifica que /libs/*.js esté presente.";
      return false;
    }
    try {
      detector = new AR.Detector();
      console.log("Detector ArUco inicializado.");
      return true;
    } catch (err) {
      console.error("Error inicializando detector AR:", err);
      statusDiv.textContent = "Error al iniciar detector AR.";
      return false;
    }
  }

  async function handleMarkerDetection(markerId, markerCorners) {
    if (isExecuting || isTeacherMode) return;

    const currentTime = Date.now();

    if (
      lastProcessedMarker.id === markerId &&
      currentTime - lastProcessedMarker.time < markerCooldown
    ) {
      return;
    }

    lastProcessedMarker = { id: markerId, time: currentTime };

    if (isWaitingForPlay) {
      if (markerId === 0) {
        isWaitingForPlay = false;
        program = [];
        statusDiv.textContent =
          "¡PLAY DETECTADO! AHORA MUESTRA LOS MOVIMIENTOS";

        program.push({
          id: markerId,
          name: markerActions[markerId].name,
          icon: markerActions[markerId].icon,
          type: markerActions[markerId].type,
        });
        updateProgramOutput();
      } else {
        statusDiv.textContent = "▶ ESPERANDO PLAY PARA COMENZAR...";
      }
    } else {
      if (markerId === 0) {
        isWaitingForPlay = false;
        program = [{ id: 0, name: "PLAY", icon: "▶️", type: "control" }];
        statusDiv.textContent = "¡PLAY DETECTADO! REINICIANDO PROGRAMA...";
      } else if (markerId === 5) {
        if (program.length > 1) {
          statusDiv.textContent = "EJECUTANDO PROGRAMA...";
          executeProgram();
        } else {
          statusDiv.textContent =
            "Programa vacío. Agrega movimientos antes de EJECUTAR";
        }
      } else if (
        markerActions[markerId] &&
        markerActions[markerId].type === "movement"
      ) {
        statusDiv.textContent = `Movimiento agregado: ${markerActions[markerId].name}`;

        program.push({
          id: markerId,
          name: markerActions[markerId].name,
          icon: markerActions[markerId].icon,
          type: markerActions[markerId].type,
        });
      }

      updateProgramOutput();
    }
  }

  function executeProgram() {
    if (program.length <= 1) {
      statusDiv.textContent =
        "Programa vacío. Agrega movimientos antes de EJECUTAR";
      return;
    }

    isExecuting = true;

    characterState.gridX = config.startPosition.x;
    characterState.gridY = config.startPosition.y;
    updateCharacterPosition();

    statusDiv.textContent = "Ejecutando programa...";

    const optimizedProgram = [];
    let currentCount = 1;

    for (let i = 1; i < program.length; i++) {
      if (
        program[i].id === program[i - 1].id &&
        program[i].type === "movement"
      ) {
        currentCount++;
      } else {
        optimizedProgram.push({ ...program[i - 1], count: currentCount });
        currentCount = 1;
      }
    }
    optimizedProgram.push({
      ...program[program.length - 1],
      count: currentCount,
    });

    let delay = 1000;
    let currentIndex = 0;

    function executeNextMovement() {
      if (currentIndex >= optimizedProgram.length) {
        setTimeout(() => {
          if (checkObjectiveReached()) {
            statusDiv.textContent = "¡OBJETO ALCANZADO!";
            showSuccessMessage();
          } else {
            statusDiv.textContent = "INTENTA NUEVAMENTE";
            isExecuting = false;
            isWaitingForPlay = true;
          }
        }, 500);
        return;
      }

      const movement = optimizedProgram[currentIndex];
      const movementName =
        movement.count > 1
          ? `${movement.name} ×${movement.count}`
          : movement.name;

      statusDiv.textContent = `Ejecutando: ${movementName}`;

      let executionsLeft = movement.count;

      function executeSingleMovement() {
        if (executionsLeft <= 0) {
          currentIndex++;
          setTimeout(executeNextMovement, 1000);
          return;
        }

        switch (movement.id) {
          case 1:
            characterState.rotation -= 90;
            break;
          case 2:
            characterState.rotation += 90;
            break;
          case 3:
            moveCharacter();
            break;
          case 4:
            characterState.rotation += 180;
            moveCharacter();
            characterState.rotation -= 180;
            break;
        }

        updateCharacterPosition();
        executionsLeft--;

        if (executionsLeft > 0) {
          setTimeout(executeSingleMovement, 600);
        } else {
          currentIndex++;
          setTimeout(executeNextMovement, 1000);
        }
      }

      executeSingleMovement();
    }

    setTimeout(executeNextMovement, delay);
  }

  function updateProgramOutput() {
    clearProgramContainer();

    if (program.length === 0) {
      appendProgramLine("ESPERANDO PLAY...", "program-command");
      return;
    }

    const programWithCounts = [];
    let currentCount = 1;

    for (let i = 0; i < program.length; i++) {
      if (
        i > 0 &&
        program[i].id === program[i - 1].id &&
        program[i].type === "movement"
      ) {
        currentCount++;
      } else {
        if (i > 0) {
          programWithCounts.push({ ...program[i - 1], count: currentCount });
        }
        currentCount = 1;
      }
    }
    programWithCounts.push({
      ...program[program.length - 1],
      count: currentCount,
    });

    programWithCounts.forEach((cmd, index) => {
      let text = `${cmd.icon} ${cmd.name}`;

      appendProgramLine(
        text,
        index === 0 ? "program-command play-command" : "program-command",
        cmd.count > 1 ? cmd.count : 1
      );
    });

    if (program.length > 1 && program[0].id === 0 && !isExecuting) {
      const executeStatus = document.createElement("div");
      executeStatus.className = "execute-status";
      const waiting = document.createElement("div");
      waiting.className = "waiting-execute";
      waiting.textContent = "⌛ Esperando EJECUTAR...";
      executeStatus.appendChild(waiting);
      programContainer.appendChild(executeStatus);
    }
  }

  function tick() {
    if (isRunning && webcam.readyState === webcam.HAVE_ENOUGH_DATA) {
      try {
        ctx.drawImage(webcam, 0, 0, videoWidth, videoHeight);
        const imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);
        const markers = detector.detect(imageData);

        if (markers && markers.length > 0) {
          markers.forEach((marker) => {
            const markerId = marker.id;
            if (Object.prototype.hasOwnProperty.call(markerActions, markerId)) {
              handleMarkerDetection(markerId, marker.corners);
            }
          });
        } else if (program.length === 0 && !isExecuting && !isTeacherMode) {
          statusDiv.textContent = "▶ ESPERANDO PLAY PARA COMENZAR...";
        }
      } catch (err) {
        console.error("Error en tick():", err);
      }
    }
    requestAnimationFrame(tick);
  }

  async function startApp() {
    const cameraReady = await setupCamera();
    if (cameraReady) {
      const detectorReady = initArucoDetector();
      if (detectorReady) {
        isRunning = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        statusDiv.textContent = "▶ ESPERANDO PLAY PARA COMENZAR...";
        tick();
      }
    }
  }

  function stopApp() {
    isRunning = false;
    isExecuting = false;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    startButton.disabled = false;
    stopButton.disabled = true;

    webcam.style.display = "none";
    gameCanvas.style.display = "none";
    cameraPlaceholder.style.display = "block";

    while (cameraPlaceholder.firstChild)
      cameraPlaceholder.removeChild(cameraPlaceholder.firstChild);
    const icon = document.createElement("div");
    icon.className = "camera-icon";
    icon.textContent = "📷";
    const p = document.createElement("p");
    p.textContent = 'PRESIONA "COMENZAR" PARA ACTIVAR LA CÁMARA';
    cameraPlaceholder.appendChild(icon);
    cameraPlaceholder.appendChild(p);

    statusDiv.textContent = "PRESIONA COMENZAR.";
  }

  function resetProgram() {
    if (config.customCharacter) {
      try {
        URL.revokeObjectURL(config.customCharacter);
      } catch (_) {}
      config.customCharacter = null;
    }
    if (config.customObjective) {
      try {
        URL.revokeObjectURL(config.customObjective);
      } catch (_) {}
      config.customObjective = null;
    }

    program = [];
    isWaitingForPlay = true;
    isExecuting = false;
    config.startPosition = { x: 0, y: 0 };
    config.targetPosition = { x: 5, y: 5 };
    applyConfiguration();
  }

  function handleResize() {
    if (grid.children.length > 0) {
      initializeGrid();
    }
  }

  function showSuccessMessage() {
    const overlay = document.createElement("div");
    overlay.className = "success-overlay";

    const successMsg = document.createElement("div");
    successMsg.className = "success-message-center";

    const text = document.createElement("div");
    text.className = "text";
    text.textContent = "¡FELICITACIONES!";
    text.style.fontSize = "1rem";
    text.style.fontWeight = "bold";
    text.style.marginBottom = "10px";

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-btn";
    closeBtn.textContent = "CONTINUAR";

    closeBtn.addEventListener("click", function () {
      overlay.remove();
      isExecuting = false;
      isWaitingForPlay = true;
      resetProgram();
    });

    successMsg.appendChild(text);

    successMsg.appendChild(closeBtn);

    overlay.appendChild(successMsg);

    const gridWrapper = document.querySelector(".grid-wrapper");
    gridWrapper.appendChild(overlay);

    isExecuting = true;
  }

  // Inicializar la aplicación
  async function init() {
    // Configurar event listeners
    startButton.addEventListener("click", startApp);
    stopButton.addEventListener("click", stopApp);
    resetButton.addEventListener("click", resetProgram);
    teacherModeButton.addEventListener("click", toggleTeacherMode);
    exitTeacherMode.addEventListener("click", toggleTeacherMode);
    saveConfigButton.addEventListener("click", saveTeacherConfiguration);

    // Configurar subida de imágenes
    setupImageUploads();

    // Configurar drag and drop
    setupDragAndDrop();

    // Configurar evento de resize
    window.addEventListener("resize", handleResize);

    // Inicializar
    stopButton.disabled = true;
    initializeGrid();
    applyConfiguration();
  }

  // Iniciar
  init();
});
