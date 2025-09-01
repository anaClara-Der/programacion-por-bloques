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
  const gridSize = 6; // Cuadrícula 6x6
  let cellSize = 60; // Tamaño de cada celda en píxeles (se ajustará responsive)
  const videoWidth = 320;
  const videoHeight = 240;

  gameCanvas.width = videoWidth;
  gameCanvas.height = videoHeight;

  // Configuración por defecto
  let config = {
    character: "🤖",
    objective: "⭐",
    startPosition: { x: 0, y: 0 }, // A1 por defecto
    targetPosition: { x: 5, y: 5 }, // F6 por defecto
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

  // 1. Inicializar la cuadrícula 6x6
  function initializeGrid() {
    grid.innerHTML = "";

    // Calcular tamaño responsive
    const gridWrapper = document.querySelector(".grid-wrapper");
    const availableWidth = gridWrapper.clientWidth;
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

        // Configurar eventos de drag and drop
        cell.addEventListener("dragover", handleDragOver);
        cell.addEventListener("drop", handleDrop);
        cell.addEventListener("dragenter", handleDragEnter);
        cell.addEventListener("dragleave", handleDragLeave);

        grid.appendChild(cell);
      }
    }

    // Ajustar posición de los elementos después de calcular cellSize
    updateCharacterPosition();
    positionObjective(config.targetPosition.x, config.targetPosition.y);
  }

  // 2. Configurar eventos de drag and drop para los elementos
  function setupDragAndDrop() {
    // Eventos para el personaje
    character.addEventListener("dragstart", handleDragStart);
    character.addEventListener("dragend", handleDragEnd);

    // Eventos para el objetivo
    objective.addEventListener("dragstart", handleDragStart);
    objective.addEventListener("dragend", handleDragEnd);
  }

  // 3. Manejar inicio de arrastre
  function handleDragStart(e) {
    this.classList.add("dragging");
    e.dataTransfer.setData("text/plain", this.id);
    e.dataTransfer.effectAllowed = "move";
  }

  // 4. Manejar fin de arrastre
  function handleDragEnd() {
    this.classList.remove("dragging");
    // Remover clase de todas las celdas
    document.querySelectorAll(".grid-cell").forEach((cell) => {
      cell.classList.remove("drag-over");
    });
  }

  // 5. Manejar arrastre sobre celda
  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  // 6. Manejar entrada a celda
  function handleDragEnter(e) {
    e.preventDefault();
    this.classList.add("drag-over");
  }

  // 7. Manejar salida de celda
  function handleDragLeave() {
    this.classList.remove("drag-over");
  }

  // 8. Manejar soltar elemento
  function handleDrop(e) {
    e.preventDefault();
    this.classList.remove("drag-over");

    const elementId = e.dataTransfer.getData("text/plain");
    const element = document.getElementById(elementId);
    const x = parseInt(this.dataset.x);
    const y = parseInt(this.dataset.y);

    if (elementId === "character") {
      config.startPosition = { x, y };
    } else if (elementId === "objective") {
      config.targetPosition = { x, y };
    }

    // Posicionar el elemento
    positionElement(element, x, y);
  }

  // 9. Posicionar elemento en la cuadrícula
  function positionElement(element, x, y) {
    element.style.left = `${x * cellSize + cellSize / 2}px`;
    element.style.top = `${y * cellSize + cellSize / 2}px`;
    element.style.transform = "translate(-50%, -50%)";
  }

  // 10. Aplicar configuración
  function applyConfiguration() {
    // Aplicar personaje
    if (config.customCharacter) {
      character.innerHTML = "";
      const img = document.createElement("img");
      img.src = config.customCharacter;
      img.style.width = "40px";
      img.style.height = "40px";
      img.style.objectFit = "contain";
      character.appendChild(img);
    } else {
      character.innerHTML = config.character;
    }

    // Aplicar objetivo
    if (config.customObjective) {
      objective.innerHTML = "";
      const img = document.createElement("img");
      img.src = config.customObjective;
      img.style.width = "35px";
      img.style.height = "35px";
      img.style.objectFit = "contain";
      objective.appendChild(img);
    } else {
      objective.innerHTML = config.objective;
    }

    // Posicionar elementos
    characterState.gridX = config.startPosition.x;
    characterState.gridY = config.startPosition.y;
    characterState.rotation = 0;

    updateCharacterPosition();
    positionObjective(config.targetPosition.x, config.targetPosition.y);

    // Reiniciar programa
    program = [];
    isWaitingForPlay = true;
    isExecuting = false;
    updateProgramOutput();

    statusDiv.textContent = "Configuración aplicada. Esperando PLAY...";
  }

  // 11. Posicionar objetivo
  function positionObjective(x, y) {
    objective.style.left = `${x * cellSize + cellSize / 2}px`;
    objective.style.top = `${y * cellSize + cellSize / 2}px`;
    objective.style.transform = "translate(-50%, -50%)";
  }

  // 12. Actualizar posición del personaje
  function updateCharacterPosition() {
    characterState.x = characterState.gridX * cellSize + cellSize / 2;
    characterState.y = characterState.gridY * cellSize + cellSize / 2;

    character.style.left = `${characterState.x}px`;
    character.style.top = `${characterState.y}px`;
    character.style.transform = `translate(-50%, -50%) rotate(${characterState.rotation}deg)`;
  }

  // 13. Verificar si se alcanzó el objetivo
  function checkObjectiveReached() {
    return (
      characterState.gridX === config.targetPosition.x &&
      characterState.gridY === config.targetPosition.y
    );
  }

  // 14. Mover personaje según la dirección actual
  function moveCharacter() {
    const radians = (characterState.rotation * Math.PI) / 180;
    const moveX = Math.round(Math.cos(radians));
    const moveY = Math.round(Math.sin(radians));

    const newX = characterState.gridX + moveX;
    const newY = characterState.gridY + moveY;

    // Verificar límites del grid
    if (newX >= 0 && newX < gridSize && newY >= 0 && newY < gridSize) {
      characterState.gridX = newX;
      characterState.gridY = newY;
      updateCharacterPosition();
      return true;
    }
    return false;
  }

  // 15. Modo docente
  function toggleTeacherMode() {
    isTeacherMode = !isTeacherMode;
    teacherPanel.style.display = isTeacherMode ? "block" : "none";
    teacherModeButton.textContent = isTeacherMode
      ? "Modo Estudiante"
      : "Modo Docente";
    teacherModeButton.classList.toggle("btn-teacher-active", isTeacherMode);

    if (isTeacherMode) {
      // Cargar valores actuales en los formularios
      document.getElementById("characterSelect").value = config.character;
      document.getElementById("objectiveSelect").value = config.objective;
    }
  }

  // 16. Guardar configuración del docente
  function saveTeacherConfiguration() {
    config.character = document.getElementById("characterSelect").value;
    config.objective = document.getElementById("objectiveSelect").value;

    applyConfiguration();
    toggleTeacherMode();
  }

  // 17. Manejar subida de imágenes personalizadas
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

    customCharacterUpload.addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = function (event) {
          config.customCharacter = event.target.result;
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    });

    customObjectiveUpload.addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) {
        const reader = new FileReader();
        reader.onload = function (event) {
          config.customObjective = event.target.result;
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    });
  }

  // 18. Acceder a la cámara
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
        "Error: No se pudo acceder a la cámara. Asegúrate de servir esta página desde un servidor local (como Live Server).";
      cameraPlaceholder.style.display = "block";
      cameraPlaceholder.innerHTML = `
                        <div class="camera-icon">❌</div>
                        <p>Error al acceder a la cámara</p>
                        <p>Asegúrate de servir esta página desde un servidor local</p>
                    `;
      return false;
    }
  }

  // 19. Inicializar el detector ArUco
  function initArucoDetector() {
    if (typeof AR === "undefined") {
      statusDiv.textContent =
        "Error: Biblioteca AR no cargada. Verifica tu conexión a internet.";
      return false;
    }
    detector = new AR.Detector();
    console.log("Detector ArUco inicializado.");
    return true;
  }

  // 20. Procesar marcadores
  function handleMarkerDetection(markerId) {
    if (isExecuting || isTeacherMode) return;

    const currentTime = new Date().getTime();

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
          "¡PLAY detectado! Ahora muestra los movimientos";

        program.push({
          id: markerId,
          name: markerActions[markerId].name,
          icon: markerActions[markerId].icon,
          type: markerActions[markerId].type,
        });
        updateProgramOutput();
      } else {
        statusDiv.textContent = "Esperando PLAY para comenzar...";
      }
    } else {
      if (markerId === 0) {
        isWaitingForPlay = false;
        program = [{ id: 0, name: "PLAY", icon: "▶️", type: "control" }];
        statusDiv.textContent = "¡PLAY detectado! Reiniciando programa...";
      } else if (markerId === 5) {
        if (program.length > 1) {
          statusDiv.textContent = "¡EJECUTAR detectado! Ejecutando programa...";
          executeProgram();
        } else {
          statusDiv.textContent =
            "Programa vacío. Agrega movimientos antes de EJECUTAR";
        }
      } else if (markerActions[markerId].type === "movement") {
        program.push({
          id: markerId,
          name: markerActions[markerId].name,
          icon: markerActions[markerId].icon,
          type: markerActions[markerId].type,
        });
        statusDiv.textContent = `Movimiento agregado: ${markerActions[markerId].name}`;
      }

      updateProgramOutput();
    }
  }

  // 21. Ejecutar programa
  function executeProgram() {
    if (program.length <= 1) {
      statusDiv.textContent =
        "Programa vacío. Agrega movimientos antes de EJECUTAR";
      return;
    }

    isExecuting = true;

    // Resetear posición pero mantener la rotación
    characterState.gridX = config.startPosition.x;
    characterState.gridY = config.startPosition.y;
    updateCharacterPosition();

    statusDiv.textContent = "Ejecutando programa...";

    let delay = 1000;
    let currentIndex = 1;

    function executeNextMovement() {
      if (currentIndex >= program.length) {
        // Programa completado
        setTimeout(() => {
          if (checkObjectiveReached()) {
            statusDiv.textContent = "¡Objetivo alcanzado!";

            // Mostrar mensaje de todo ok
            const successMsg = document.createElement("div");
            successMsg.className = "success-message";
            successMsg.textContent = "¡Felicidades!.";
            programContainer.appendChild(successMsg);
          } else {
            statusDiv.textContent = " Intenta nuevamente.";
          }
          isExecuting = false;
          isWaitingForPlay = true;
        }, 500);
        return;
      }

      const movement = program[currentIndex];
      statusDiv.textContent = `Ejecutando: ${movement.name}`;

      switch (movement.id) {
        case 1: // GIRAR_IZQUIERDA
          characterState.rotation -= 90;
          break;
        case 2: // GIRAR_DERECHA
          characterState.rotation += 90;
          break;
        case 3: // ADELANTE
          moveCharacter();
          break;
        case 4: // ATRAS
          characterState.rotation += 180;
          moveCharacter();
          characterState.rotation -= 180;
          break;
      }

      updateCharacterPosition();
      currentIndex++;

      setTimeout(executeNextMovement, 1000);
    }

    setTimeout(executeNextMovement, delay);
  }

  // 22. Actualizar visualización del programa
  function updateProgramOutput() {
    if (program.length === 0) {
      programContainer.innerHTML = "Esperando PLAY ...";
      return;
    }

    programContainer.innerHTML = program
      .map(
        (cmd, index) =>
          `<div class="program-command ${index === 0 ? "play-command" : ""}">${
            cmd.icon
          } ${cmd.name}</div>`
      )
      .join("");

    if (program.length > 1 && program[0].id === 0 && !isExecuting) {
      const executeStatus = document.createElement("div");
      executeStatus.className = "execute-status";
      executeStatus.innerHTML =
        '<div class="waiting-execute">⌛ Esperando EJECUTAR (ID 5)...</div>';

      if (!document.querySelector(".execute-status")) {
        programContainer.appendChild(executeStatus);
      }
    }
  }

  // 23. Bucle principal de detección
  function tick() {
    if (isRunning && webcam.readyState === webcam.HAVE_ENOUGH_DATA) {
      ctx.drawImage(webcam, 0, 0, videoWidth, videoHeight);
      const imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);
      const markers = detector.detect(imageData);

      if (markers.length > 0) {
        markers.forEach((marker) => {
          const markerId = marker.id;
          if (markerActions.hasOwnProperty(markerId)) {
            handleMarkerDetection(markerId);
          }
        });
      } else if (program.length === 0 && !isExecuting && !isTeacherMode) {
        statusDiv.textContent = "Esperando PLAY para comenzar...";
      }
    }
    requestAnimationFrame(tick);
  }

  // 24. Iniciar aplicación
  async function startApp() {
    const cameraReady = await setupCamera();
    if (cameraReady) {
      const detectorReady = initArucoDetector();
      if (detectorReady) {
        isRunning = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        statusDiv.textContent = "Esperando PLAY para comenzar...";
        tick();
      }
    }
  }

  // 25. Detener aplicación
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
    cameraPlaceholder.innerHTML = `
                    <div class="camera-icon">📷</div>
                    <p>Presiona "Comenzar" para activar la cámara</p>
                `;

    statusDiv.textContent =
      "Detección detenida. Presiona Comenzar para reiniciar.";
  }

  // 26. Reiniciar programa
  function resetProgram() {
    program = [];
    isWaitingForPlay = true;
    isExecuting = false;
    applyConfiguration();
  }

  // 27. Ajustar tamaño responsive
  function handleResize() {
    if (grid.children.length > 0) {
      initializeGrid();
    }
  }

  // Inicializar la aplicación
  function init() {
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
