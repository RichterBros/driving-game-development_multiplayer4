import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { physicsWorld } from './physics.js';
import * as RAPIER from '@dimforge/rapier3d-compat';
// Socket.IO will be loaded via script tag in HTML

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 100, 200); // Increased height and distance for better visibility
camera.lookAt(0, 0, 0);

// Add grid helper for better spatial awareness
const gridHelper = new THREE.GridHelper(100, 20);
scene.add(gridHelper);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Orbit Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 20;
controls.maxDistance = 500;
controls.maxPolarAngle = Math.PI / 2;
controls.enabled = true; // Enable controls by default for debugging

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 500;
dirLight.shadow.camera.left = -100;
dirLight.shadow.camera.right = 100;
dirLight.shadow.camera.top = 100;
dirLight.shadow.camera.bottom = -100;
scene.add(dirLight);

// Initialize loader and car
const loader = new GLTFLoader();
let car = null;
let carBodyHandle = null;
let groundBodyHandle = null;

// Car controls
const carControls = {
    w: false,
    s: false,
    a: false,
    d: false,
    f: false,
    space: false
};

// Control mode
let isOrbitMode = false;

// Car physics properties
const carProperties = {
    maxSpeed: 30,
    acceleration: 50,
    turnSpeed: 50,
    brakeForce: 30
};

// Global variables for multiplayer
let socket;
let playerId;
const otherPlayers = {}; // Store other players' cars
let myPlayerId = null;

// Add after the scene setup, before the socket initialization
// Player count display
const playerCountDiv = document.createElement('div');
playerCountDiv.style.position = 'absolute';
playerCountDiv.style.top = '10px';
playerCountDiv.style.right = '10px';
playerCountDiv.style.color = 'white';
playerCountDiv.style.fontFamily = 'Arial';
playerCountDiv.style.fontSize = '20px';
playerCountDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
playerCountDiv.style.padding = '10px';
playerCountDiv.style.borderRadius = '5px';
document.body.appendChild(playerCountDiv);

// Health bar container
const healthBarContainer = document.getElementById('healthBarContainer');
const healthBar = document.getElementById('healthBar');

// Player health
let playerHealth = 100;

// Add isReadyToShoot flag near other global variables
let isReadyToShoot = false;

// Add bullet cooldown tracking
const bulletCooldowns = new Map(); // Track when bullets can start hitting their owner

// Add bullets array near other global variables
let bullets = []; // Store all bullets in the game
const MAX_BULLETS = 100; // Maximum number of bullets in the scene
const BULLET_SPEED = 100.0; // Speed of bullets
const BULLET_LIFETIME = 3000; // Bullet lifetime in milliseconds

// Add skid mark variables near other global variables
let skidMarks = []; // Store all skid marks
const MAX_SKID_MARKS = 100; // Maximum number of skid marks
const SKID_MARK_LIFETIME = 5000; // How long skid marks last in milliseconds

// Add skid mark material setup
const skidMarkMaterial = new THREE.MeshBasicMaterial({
    color: 0x333333,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
});

// Add skid mark geometry
const skidMarkGeometry = new THREE.PlaneGeometry(0.5, 0.5);

// Add score display
const scoreDiv = document.createElement('div');
scoreDiv.style.position = 'absolute';
scoreDiv.style.top = '10px';
scoreDiv.style.left = '10px';
scoreDiv.style.color = 'white';
scoreDiv.style.fontFamily = 'Arial';
scoreDiv.style.fontSize = '20px';
scoreDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
scoreDiv.style.padding = '10px';
scoreDiv.style.borderRadius = '5px';
document.body.appendChild(scoreDiv);

// Add score tracking
let playerScore = 0;
let otherPlayerScore = 0;

// Update score display
function updateScoreDisplay() {
    scoreDiv.textContent = `Your Score: ${playerScore} | Other Player: ${otherPlayerScore}`;
}

// Initialize score display
updateScoreDisplay();

// Update the player count display
function updatePlayerCount() {
    const otherPlayerCount = Object.keys(otherPlayers).length;
    const totalPlayers = otherPlayerCount + 1; // +1 for local player
    console.log('Updating player count:', {
        otherPlayers: otherPlayerCount,
        totalPlayers: totalPlayers,
        playerIds: Object.keys(otherPlayers)
    });
    playerCountDiv.textContent = `Players in game: ${totalPlayers}`;
}

// Update health bar
function updateHealthBar() {
    const healthPercentage = Math.max(0, playerHealth);
    healthBar.style.width = `${healthPercentage}%`;
    
    // Change color based on health
    if (healthPercentage > 50) {
        healthBar.style.backgroundColor = 'limegreen';
    } else if (healthPercentage > 25) {
        healthBar.style.backgroundColor = 'yellow';
    } else {
        healthBar.style.backgroundColor = 'red';
    }
}

// Add victory message display
const victoryDiv = document.createElement('div');
victoryDiv.style.position = 'absolute';
victoryDiv.style.top = '50%';
victoryDiv.style.left = '50%';
victoryDiv.style.transform = 'translate(-50%, -50%)';
victoryDiv.style.color = 'white';
victoryDiv.style.fontFamily = 'Arial';
victoryDiv.style.fontSize = '72px';
victoryDiv.style.fontWeight = 'bold';
victoryDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
victoryDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
victoryDiv.style.padding = '20px';
victoryDiv.style.borderRadius = '10px';
victoryDiv.style.display = 'none';
victoryDiv.style.textAlign = 'center';
victoryDiv.style.zIndex = '1000'; // Ensure it's on top
document.body.appendChild(victoryDiv);

// Initialize socket connection
function initSocket() {
    console.log('Initializing socket connection...');
    socket = io('http://localhost:3000');

    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        myPlayerId = socket.id;
        updatePlayerCount();
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
    });

    socket.on('initialize', (data) => {
        console.log('Game initialized with data:', data);
        myPlayerId = data.id;
        console.log('My player ID:', myPlayerId);
        
        // Create cars for existing players
        let playerIndex = 0;
        for (const id in data.players) {
            if (id !== myPlayerId) {
                console.log('Another player is already in the game:', id);
                console.log('Player data:', data.players[id]);
                createOtherPlayerCar({
                    id: id,
                    position: data.players[id].position,
                    rotation: data.players[id].rotation,
                    index: playerIndex++
                });
            }
        }
        updatePlayerCount();
    });

    socket.on('playerJoined', (playerData) => {
        if (playerData.id !== myPlayerId) {
            console.log('Another player joined the game:', playerData.id);
            console.log('Player data:', playerData);
            createOtherPlayerCar({
                ...playerData,
                index: Object.keys(otherPlayers).length
            });
            updatePlayerCount();
        }
    });

    socket.on('playerMoved', (data) => {
        console.log('SIMPLE DEBUG: Received playerMoved event for player:', data.id);
        
        const otherPlayer = otherPlayers[data.id];
        
        if (!otherPlayer) {
            console.warn('SIMPLE DEBUG: Could not find remote player for update:', data.id);
            console.log('SIMPLE DEBUG: Available remote players:', Object.keys(otherPlayers));
            return;
        }
        
        if (!data.position) {
            console.warn('SIMPLE DEBUG: No position data received for player:', data.id);
            return;
        }
        
        // Get previous position for logging
        const oldPos = otherPlayer.mesh ? otherPlayer.mesh.position.clone() : null;
        
        // Update the mesh position and rotation
        if (otherPlayer.mesh) {
            otherPlayer.mesh.position.set(
                data.position.x,
                data.position.y,
                data.position.z
            );
            
            if (data.rotation) {
                otherPlayer.mesh.quaternion.set(
                    data.rotation.x,
                    data.rotation.y,
                    data.rotation.z,
                    data.rotation.w
                );
            }
            
            console.log('SIMPLE DEBUG: Updated remote car position from', 
                oldPos ? `(${oldPos.x.toFixed(2)}, ${oldPos.y.toFixed(2)}, ${oldPos.z.toFixed(2)})` : 'unknown',
                'to', 
                `(${data.position.x.toFixed(2)}, ${data.position.y.toFixed(2)}, ${data.position.z.toFixed(2)})`
            );
        }
        
        // Update the physics body if it exists
        if (otherPlayer.body) {
            otherPlayer.body.setTranslation(data.position, true);
            if (data.rotation) {
                otherPlayer.body.setRotation(data.rotation, true);
            }
        }
    });

    socket.on('playerLeft', (id) => {
        if (otherPlayers[id]) {
            scene.remove(otherPlayers[id].mesh);
            physicsWorld.world.removeRigidBody(otherPlayers[id].body);
            delete otherPlayers[id];
            console.log('Player left the game:', id);
            updatePlayerCount();
        }
    });
    
    


    //Update the socket event handler name to match server
   socket.on('playerHealthUpdate', (data) => {
        console.log('Received health update:', data);
        if (data.id === myPlayerId) {
            playerHealth = data.health;
           updateHealthBar();
            
            // Add visual feedback when hit
           document.body.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
           setTimeout(() => {
               document.body.style.backgroundColor = '';
           }, 200);
        } else if (otherPlayers[data.id]) {
            otherPlayers[data.id].health = data.health;
        }
    });

    socket.on('scoreUpdate', (scoreData) => {
        try {
            // Handle both array and object formats
            if (Array.isArray(scoreData)) {
                scoreData.forEach(({ id, score }) => {
                    if (id === myPlayerId) {
                        playerScore = score;
                    } else {
                        otherPlayerScore = score;
                    }
                });
            } else if (typeof scoreData === 'object') {
                // Convert object format to array format
                Object.entries(scoreData).forEach(([id, score]) => {
                    if (id === myPlayerId) {
                        playerScore = score;
                    } else {
                        otherPlayerScore = score;
                    }
                });
            } else {
                console.error('Invalid score update format:', scoreData);
                return;
            }
            updateScoreDisplay();
        } catch (error) {
            console.error('Error processing score update:', error);
        }
    });

    socket.on('bulletCreated', (data) => {
        // Ignore our own bullets (we already created them locally)
        if (data.owner === myPlayerId) {
            console.log('[DEBUG] Ignoring own bullet:', data.id);
            return;
        }
    
        console.log('[DEBUG] Bullet created by other player:', data);
    
        // Create visual + physics bullet
        const bulletGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const bulletMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ffff, // Cyan color for other players' bullets
            transparent: true,
            opacity: 1.0
        });
        const bulletMesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
        
        // Ensure bullet is visible
        bulletMesh.visible = true;
        bulletMesh.material.needsUpdate = true;
        
        bulletMesh.position.set(data.position.x, data.position.y, data.position.z);
        scene.add(bulletMesh);
    
        // Create physics body with increased damping for stability
        const bulletBodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(data.position.x, data.position.y, data.position.z)
            .setLinearDamping(0.1) // Increased damping
            .setAngularDamping(0.5) // Increased angular damping
            .setCcdEnabled(true); // Enable continuous collision detection
    
        const bulletBody = physicsWorld.world.createRigidBody(bulletBodyDesc);
        const bulletColliderDesc = RAPIER.ColliderDesc.ball(0.2)
            .setRestitution(0.2)
            .setFriction(0.0)
            .setDensity(0.1);
        physicsWorld.world.createCollider(bulletColliderDesc, bulletBody);
    
        // Apply velocity and log for debugging
        const velocity = {
            x: data.velocity.x * 1.2, // Slightly increase velocity to compensate for damping
            y: data.velocity.y * 1.2,
            z: data.velocity.z * 1.2
        };
        bulletBody.setLinvel(velocity, true);
        console.log('[DEBUG] Set bullet velocity:', velocity);
    
        const bullet = {
            id: data.id,
            mesh: bulletMesh,
            body: bulletBody,
            spawnTime: Date.now(),
            owner: data.owner
        };
    
        bullets.push(bullet);
        console.log('[DEBUG] Added bullet to array, total bullets:', bullets.length);
        
        // Set cooldown for self-hit
        bulletCooldowns.set(data.id, Date.now() + 500);
    });
    
    socket.on('gameOver', (data) => {
        console.log('Game over event received:', data);
        if (data.winnerId === myPlayerId) {
            console.log('I won!');
            victoryDiv.textContent = 'YOU WIN!!!';
            victoryDiv.style.color = '#4CAF50'; // Green color for victory
            victoryDiv.style.fontSize = '96px'; // Make it bigger
            victoryDiv.style.textShadow = '4px 4px 8px rgba(0,0,0,0.8)'; // Enhanced shadow
        } else {
            console.log('I lost!');
            victoryDiv.textContent = 'GAME OVER';
            victoryDiv.style.color = '#f44336'; // Red color for defeat
            victoryDiv.style.fontSize = '72px';
            victoryDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
        }
        victoryDiv.style.display = 'block';
        
        // Reset game after 3 seconds
        setTimeout(() => {
            victoryDiv.style.display = 'none';
            // Reset scores
            playerScore = 0;
            otherPlayerScore = 0;
            updateScoreDisplay();
        }, 3000);
    });
}

// Create another player's car - simplified version
function createOtherPlayerCar(playerData) {
    console.log('SIMPLE DEBUG: Creating remote car for player:', playerData.id);
    
    // Create a simple box for immediate visibility
    const color = playerData.index % 2 === 0 ? 0xff0000 : 0x0000ff; // red or blue
    const geo = new THREE.BoxGeometry(4, 2, 8);
    const mat = new THREE.MeshStandardMaterial({ color });
    const tempMesh = new THREE.Mesh(geo, mat);
    tempMesh.castShadow = true;
    tempMesh.receiveShadow = true;
    
    // Set initial position
    const position = {
        x: playerData.position?.x ?? 0,
        y: playerData.position?.y ?? 2,
        z: playerData.position?.z ?? 0
    };
    
    tempMesh.position.set(position.x, position.y, position.z);
    scene.add(tempMesh);
    
    console.log('SIMPLE DEBUG: Added temporary remote car at position:', position);
    
    // Store the temp mesh
    otherPlayers[playerData.id] = { 
        mesh: tempMesh,
        isTemporary: true
    };
    
    console.log('SIMPLE DEBUG: Stored remote player with ID:', playerData.id);
    console.log('SIMPLE DEBUG: otherPlayers keys:', Object.keys(otherPlayers));
    
    // Now load the actual car model
    loader.load(
        'car2.glb',
        (gltf) => {
            console.log('SIMPLE DEBUG: Car model loaded for remote player:', playerData.id);
            const mesh = gltf.scene;
            
            mesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    // Use a colored material to distinguish cars
                    child.material = new THREE.MeshStandardMaterial({ 
                        color: color,
                        metalness: 0.5,
                        roughness: 0.5
                    });
                }
            });
            
            // Copy position and rotation from temp mesh
            mesh.position.copy(tempMesh.position);
            mesh.quaternion.copy(tempMesh.quaternion);
            
            // Remove the temporary mesh
            scene.remove(tempMesh);
            
            // Create physics body
            const boundingBox = new THREE.Box3().setFromObject(mesh);
            const size = new THREE.Vector3();
            boundingBox.getSize(size);
            
            const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(position.x, position.y, position.z)
                .setLinearDamping(0.3)
                .setAngularDamping(0.8)
                .setCanSleep(false)
                .setCcdEnabled(true)
                .setGravityScale(1.2);
            
            const body = physicsWorld.world.createRigidBody(bodyDesc);
            if (!body) {
                console.error("SIMPLE DEBUG: Failed to create physics body for remote car");
                return;
            }
            
            const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
                .setRestitution(0.1)
                .setFriction(0.95)
                .setDensity(50.0);
            
            physicsWorld.world.createCollider(colliderDesc, body);
            
            // Replace the temporary mesh with the actual car model
            otherPlayers[playerData.id] = {
                mesh: mesh,
                body: body,
                health: 100 // Keep the health property but remove healthBar
            };
            
            // Add to scene
            scene.add(mesh);
            
            console.log('SIMPLE DEBUG: Remote car model added to scene at position:', mesh.position);
            updatePlayerCount();
        },
        (xhr) => {
            console.log('SIMPLE DEBUG: Remote car loading progress:', (xhr.loaded / xhr.total * 100) + '%');
        },
        (error) => {
            console.error('SIMPLE DEBUG: Error loading remote car:', error);
        }
    );
    
    updatePlayerCount();
}

// Set up keyboard controls
function setupControls() {
    console.log('[DEBUG] Setting up controls');
    document.addEventListener('keydown', (event) => {
        switch(event.key.toLowerCase()) {
            case 'w':
                carControls.w = true;
                break;
            case 's':
                carControls.s = true;
                break;
            case 'a':
                carControls.a = true;
                break;
            case 'd':
                carControls.d = true;
                break;
            case 'c': // Toggle between car and orbit controls
                isOrbitMode = !isOrbitMode;
                controls.enabled = isOrbitMode;
                if (isOrbitMode && car && carBodyHandle) {
                    const body = physicsWorld.world.bodies.get(carBodyHandle);
                    if (body) {
                        const pos = body.translation();
                        controls.target.set(pos.x, pos.y + 1, pos.z);
                        camera.position.set(pos.x, pos.y + 20, pos.z + 30);
                    }
                }
                break;
            case 'f': // Flip car
                carControls.f = true;
                flipCar();
                break;
            case ' ': // Spacebar for shooting
                carControls.space = true;
                fireBullet();
                break;
        }
    });

    document.addEventListener('keyup', (event) => {
        switch(event.key.toLowerCase()) {
            case 'w':
                carControls.w = false;
                break;
            case 's':
                carControls.s = false;
                break;
            case 'a':
                carControls.a = false;
                break;
            case 'd':
                carControls.d = false;
                break;
            case 'f':
                carControls.f = false;
                break;
            case ' ': // Spacebar
                carControls.space = false;
                break;
        }
    });
}

// Function to flip the car back over
function flipCar() {
    if (!car || !carBodyHandle) return;
    
    const body = physicsWorld.world.bodies.get(carBodyHandle);
    if (!body) return;

    // Get car's current orientation
    const rot = body.rotation();
    const quaternion = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const up = new THREE.Vector3(0, 1, 0);
    const carUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    
    // Check if car is upside down (dot product < 0)
    if (up.dot(carUp) < 0) {
        // Apply upward force and rotation to flip the car
        const pos = body.translation();
        
        // Stop current movement
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        
        // Lift the car slightly
        body.setTranslation({ x: pos.x, y: pos.y + 2, z: pos.z }, true);
        
        // Apply rotation to right the car
        const targetRotation = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0, quaternion.y, 0)
        );
        body.setRotation(targetRotation, true);
        
        console.log("Flipping car back over");
    }
}

// Update car physics based on controls
function updateCarPhysics() {
    if (!car || !carBodyHandle) {
        console.log("Car or carBodyHandle not initialized");
        return;
    }
    
    const body = physicsWorld.world.bodies.get(carBodyHandle);
    if (!body) {
        console.log("Could not get physics body for car");
        return;
    }

    const pos = body.translation();
    const rot = body.rotation();

    // Reset if invalid
    if (!isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) {
        console.warn("Invalid car position detected, resetting position");
        body.setTranslation({ x: 0, y: 15, z: 0 }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        return;
    }

    // Get current velocity and angular velocity
    const linvel = body.linvel();
    const angvel = body.angvel();

    // Limit angular velocity to prevent excessive spinning
    const maxAngularVelocity = 3.0; // Reduced from 5.0
    if (Math.abs(angvel.x) > maxAngularVelocity || 
        Math.abs(angvel.y) > maxAngularVelocity || 
        Math.abs(angvel.z) > maxAngularVelocity) {
        const scale = maxAngularVelocity / Math.max(
            Math.abs(angvel.x),
            Math.abs(angvel.y),
            Math.abs(angvel.z)
        );
        body.setAngvel({
            x: angvel.x * scale,
            y: angvel.y * scale,
            z: angvel.z * scale
        }, true);
    }

    // Forward vector based on car's rotation
    const forward = new THREE.Vector3(0, 0, 1); // +Z is forward
    const quaternion = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const rotatedForward = forward.clone().applyQuaternion(quaternion).normalize();

    let impulse = new THREE.Vector3(0, 0, 0);

    if (carControls.w) {
        console.log("W key pressed - applying forward impulse");
        impulse.add(rotatedForward.clone().multiplyScalar(8000.0)); // Increased from 800.0
    }
    if (carControls.s) {
        console.log("S key pressed - applying backward impulse");
        impulse.add(rotatedForward.clone().multiplyScalar(-8000.0)); // Increased from -500.0
    }

    // Apply stabilizing torque to keep car upright
    const up = new THREE.Vector3(0, 1, 0);
    const carUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const cross = new THREE.Vector3().crossVectors(up, carUp);
    const stabilizationTorque = cross.multiplyScalar(100.0); // Increased from 50.0

    if (carControls.a) {
        console.log("A key pressed - applying left turn");
        body.applyTorqueImpulse({ x: 0, y: 50000.0, z: 0 }, true); // Increased from 5000.0
    }
    if (carControls.d) {
        console.log("D key pressed - applying right turn");
        body.applyTorqueImpulse({ x: 0, y: -50000.0, z: 0 }, true); // Increased from -5000.0
    }

    // Apply stabilization torque
    body.applyTorqueImpulse({
        x: stabilizationTorque.x,
        y: stabilizationTorque.y,
        z: stabilizationTorque.z
    }, true);

    if (!impulse.equals(new THREE.Vector3(0, 0, 0))) {
        console.log("Applying impulse:", impulse);
        body.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
    }

    // Update car mesh position and rotation
    car.position.set(pos.x, pos.y, pos.z);
    car.quaternion.set(rot.x, rot.y, rot.z, rot.w);
}

// Update camera to follow car
function updateCamera() {
    if (!car || !carBodyHandle) return;
    
    const body = physicsWorld.world.bodies.get(carBodyHandle);
    if (!body) return;
    
    const pos = body.translation();
    
    // Calculate camera position
    const cameraOffset = new THREE.Vector3(0, 20, 30);
    const cameraPosition = new THREE.Vector3(
        pos.x + cameraOffset.x,
        pos.y + cameraOffset.y,
        pos.z + cameraOffset.z
    );
    
    // Smoothly move camera
    camera.position.lerp(cameraPosition, 0.1);
    camera.lookAt(pos.x, pos.y + 2, pos.z);
}

// Load landscape
function loadLandscape() {
    return new Promise((resolve, reject) => {
        const loader = new GLTFLoader();
        loader.load(
            'landscape.glb',
            (gltf) => {
                const model = gltf.scene;
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        scene.add(child);

                        // Update world matrix to ensure correct transformations
                        child.updateMatrixWorld(true);
                        
                        // Convert to non-indexed geometry if needed
                        const geometry = child.geometry.index !== null
                            ? child.geometry.toNonIndexed()
                            : child.geometry;

                        geometry.computeVertexNormals();

                        // Extract transformed vertices
                        const positionAttr = geometry.attributes.position;
                        const vertices = [];
                        for (let i = 0; i < positionAttr.count; i++) {
                            const vertex = new THREE.Vector3();
                            vertex.fromBufferAttribute(positionAttr, i);
                            vertex.applyMatrix4(child.matrixWorld); // 🔥 apply world transform!
                            vertices.push(vertex.x, vertex.y, vertex.z);
                        }

                        // Create sequential indices for non-indexed geometry
                        const indices = [];
                        for (let i = 0; i < positionAttr.count; i++) {
                            indices.push(i);
                        }

                        const verticesArray = new Float32Array(vertices);
                        const indicesArray = new Uint32Array(indices);

                        // Remove old ground body if it exists
                        if (groundBodyHandle) {
                            const oldBody = physicsWorld.world.bodies.get(groundBodyHandle);
                            if (oldBody) {
                                physicsWorld.world.removeRigidBody(oldBody);
                            }
                        }

                        // Create ground body + TriMesh collider
                        const groundBodyDesc = RAPIER.RigidBodyDesc.fixed();
                        const groundBody = physicsWorld.world.createRigidBody(groundBodyDesc);

                        const colliderDesc = RAPIER.ColliderDesc.trimesh(verticesArray, indicesArray);
                        physicsWorld.world.createCollider(colliderDesc, groundBody);

                        groundBodyHandle = groundBody.handle;

                        console.log('Created trimesh collider with', positionAttr.count, 'vertices');
                    }
                });
                console.log('Landscape loaded');
                resolve();
            },
            (xhr) => {
                console.log((xhr.loaded / xhr.total * 100) + '% loaded');
            },
            (error) => {
                console.error('Error loading landscape:', error);
                reject(error);
            }
        );
    });
}

// Function to reload landscape
function reloadLandscape() {
    return new Promise((resolve, reject) => {
        // Remove old landscape meshes from scene
        scene.traverse((child) => {
            if (child.isMesh && child !== car) {
                scene.remove(child);
            }
        });

        // Load new landscape
        loadLandscape()
            .then(() => {
                console.log('Landscape reloaded successfully');
                resolve();
            })
            .catch((error) => {
                console.error('Error reloading landscape:', error);
                reject(error);
            });
    });
}

// Load car model
function loadCar() {
    return new Promise((resolve, reject) => {
        loader.load(
            'car2.glb',
            (gltf) => {
                car = gltf.scene;
                
                // Enable shadows
                car.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                // Position car
                car.position.set(0, 2, 0);
                scene.add(car);
                
                // Create physics body for car
                const boundingBox = new THREE.Box3().setFromObject(car);
                const size = new THREE.Vector3();
                boundingBox.getSize(size);
                const center = new THREE.Vector3();
                boundingBox.getCenter(center);
                
                console.log("Creating car physics body with size:", size);
                
                // Create physics body with improved stability settings
                const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
                    .setTranslation(center.x, center.y, center.z)
                    .setLinearDamping(0.3)
                    .setAngularDamping(0.8)
                    .setCanSleep(false)
                    .setCcdEnabled(true)
                    .setGravityScale(1.2);
                
                const body = physicsWorld.world.createRigidBody(bodyDesc);
                if (!body) {
                    console.error("Failed to create physics body for car");
                    reject(new Error("Failed to create physics body"));
                    return;
                }
                
                carBodyHandle = body.handle;
                console.log('Car physics body created with handle:', carBodyHandle);
                
                // Create collider with improved stability settings
                const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
                    .setRestitution(0.1)
                    .setFriction(0.95)
                    .setDensity(50.0);
                
                physicsWorld.world.createCollider(colliderDesc, body);
                
                console.log('Car loaded with physics, handle:', carBodyHandle);
                isReadyToShoot = true; // Set the flag to true after car is fully loaded
                resolve();
            },
            (xhr) => {
                console.log((xhr.loaded / xhr.total * 100) + '% loaded');
            },
            (error) => {
                console.error('Error loading car:', error);
                reject(error);
            }
        );
    });
}

// Create a physics sphere
function createPhysicsSphere(color = 0xff0000, position = { x: 0, y: 20, z: 0 }) {
    const radius = 2; // Consistent radius for both visual and physics
    
    // Create the visual sphere
    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshPhongMaterial({ 
        color: color,
        shininess: 100,
        specular: 0x444444,
        emissive: color,
        emissiveIntensity: 0.2
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    
    // Position the sphere
    sphere.position.set(position.x, position.y, position.z);
    scene.add(sphere);
    
    // Add a point light to each sphere
    const sphereLight = new THREE.PointLight(color, 1, 10);
    sphereLight.position.set(position.x, position.y, position.z);
    scene.add(sphereLight);
    
    // Create physics body with matching radius
    const rigidBodyHandle = physicsWorld.createSphereBody(position, radius);
    
    // Add debug helper
    const helper = new THREE.BoxHelper(sphere, 0xffff00);
    scene.add(helper);
    
    return {
        mesh: sphere,
        rigidBodyHandle,
        light: sphereLight,
        helper: helper
    };
}

// Safe wrapper to remove rigid bodies
function safeRemoveRigidBody(handle) {
    physicsWorld.removeRigidBody(handle);
}

// Update car position based on physics
function updateCar() {
    if (car && carBodyHandle) {
        const state = physicsWorld.getBodyState(carBodyHandle);
        if (state) {
            car.position.set(
                state.position.x,
                state.position.y,
                state.position.z
            );
            
            car.quaternion.set(
                state.rotation.x,
                state.rotation.y,
                state.rotation.z,
                state.rotation.w
            );
        }
    }
}

// Function to create and fire a bullet
function fireBullet() {
    console.log('[DEBUG] fireBullet called');
    if (!isReadyToShoot || !car || !carBodyHandle) {
        console.warn('[DEBUG] Cannot fire: not ready to shoot or car/carBodyHandle not ready');
        return;
    }
    
    const body = physicsWorld.world.bodies.get(carBodyHandle);
    if (!body) {
        console.warn('[DEBUG] Cannot fire: physics body not found');
        return;
    }

    // Get car's position and rotation
    const carPos = body.translation();
    const carRot = body.rotation();
    
    // Create bullet geometry and material
    const bulletGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000,
        transparent: true,
        opacity: 1.0
    });
    const bulletMesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
    
    // Position bullet at the front of the car
    const forward = new THREE.Vector3(0, 0, 1);
    const quaternion = new THREE.Quaternion(carRot.x, carRot.y, carRot.z, carRot.w);
    const rotatedForward = forward.clone().applyQuaternion(quaternion).normalize();
    
    // Calculate bullet spawn position (further in front of the car)
    const spawnPos = {
        x: carPos.x + rotatedForward.x * 5, // Increased from 2 to 5
        y: carPos.y + 0.5,
        z: carPos.z + rotatedForward.z * 5  // Increased from 2 to 5
    };
    
    bulletMesh.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
    scene.add(bulletMesh);
    
    // Create physics body for bullet
    const bulletBodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
        .setLinearDamping(0.0)
        .setAngularDamping(0.0);
    
    const bulletBody = physicsWorld.world.createRigidBody(bulletBodyDesc);
    
    const bulletColliderDesc = RAPIER.ColliderDesc.ball(0.2)
        .setRestitution(0.2)
        .setFriction(0.0)
        .setDensity(0.1);
    
    physicsWorld.world.createCollider(bulletColliderDesc, bulletBody);
    
    // Apply initial velocity in the direction the car is facing
    const velocity = {
        x: rotatedForward.x * BULLET_SPEED,
        y: rotatedForward.y * BULLET_SPEED,
        z: rotatedForward.z * BULLET_SPEED
    };
    bulletBody.setLinvel(velocity, true);
    
    // Create unique bullet ID
    const bulletId = `${myPlayerId}-${Date.now()}`;
    
    // Store bullet data with owner information
    const bullet = {
        id: bulletId,
        mesh: bulletMesh,
        body: bulletBody,
        spawnTime: Date.now(),
        owner: myPlayerId
    };
    
    bullets.push(bullet);
    
    // Set cooldown for self-hit
    bulletCooldowns.set(bulletId, Date.now() + 500); // 500ms cooldown
    
    // Emit bullet creation event to server with owner information
    const bulletData = {
        id: bulletId,
        position: spawnPos,
        velocity: velocity,
        owner: myPlayerId
    };
    console.log('[DEBUG] Emitting createBullet:', bulletData);
    socket.emit('createBullet', bulletData);
    
    // Remove oldest bullet if we've reached the maximum
    if (bullets.length > MAX_BULLETS) {
        removeBullet(bullets[0]);
    }
}

// Function to remove a bullet
function removeBullet(bullet) {
    if (!bullet) return;
    
    // Remove from physics world
    physicsWorld.world.removeRigidBody(bullet.body);
    
    // Remove from scene
    scene.remove(bullet.mesh);
    
    // Remove from bullets array
    const index = bullets.indexOf(bullet);
    if (index !== -1) {
        bullets.splice(index, 1);
    }
    
    // Remove cooldown tracking
    bulletCooldowns.delete(bullet.id);
}

// Update bullets in animation loop
function updateBullets() {
    const currentTime = Date.now();
    
    // Update each bullet
    bullets.forEach((bullet, index) => {
        // Update bullet position
        const pos = bullet.body.translation();
        bullet.mesh.position.set(pos.x, pos.y, pos.z);
        
        // Remove bullet if it's too old
        if (currentTime - bullet.spawnTime > BULLET_LIFETIME) {
            removeBullet(bullet);
        }
    });
}

// Update controls based on keyboard input
function updateControls() {
    if (!car || !carBodyHandle) return;

    const body = physicsWorld.world.bodies.get(carBodyHandle);
    if (!body) return;

    // Get current velocity and angular velocity
    const linvel = body.linvel();
    const angvel = body.angvel();

    // Limit angular velocity to prevent excessive spinning
    const maxAngularVelocity = 3.0;
    if (Math.abs(angvel.x) > maxAngularVelocity || 
        Math.abs(angvel.y) > maxAngularVelocity || 
        Math.abs(angvel.z) > maxAngularVelocity) {
        const scale = maxAngularVelocity / Math.max(
            Math.abs(angvel.x),
            Math.abs(angvel.y),
            Math.abs(angvel.z)
        );
        body.setAngvel({
            x: angvel.x * scale,
            y: angvel.y * scale,
            z: angvel.z * scale
        }, true);
    }

    // Get car's rotation
    const rot = body.rotation();
    const quaternion = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

    // Forward vector based on car's rotation
    const forward = new THREE.Vector3(0, 0, 1);
    const rotatedForward = forward.clone().applyQuaternion(quaternion).normalize();

    let impulse = new THREE.Vector3(0, 0, 0);

    if (carControls.w) {
        impulse.add(rotatedForward.clone().multiplyScalar(8000.0));
    }
    if (carControls.s) {
        impulse.add(rotatedForward.clone().multiplyScalar(-5000.0));
    }

    // Apply stabilizing torque to keep car upright
    const up = new THREE.Vector3(0, 1, 0);
    const carUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const cross = new THREE.Vector3().crossVectors(up, carUp);
    const stabilizationTorque = cross.multiplyScalar(100.0);

    if (carControls.a) {
        body.applyTorqueImpulse({ x: 0, y: 50000.0, z: 0 }, true); // Increased from 5000.0
    }
    if (carControls.d) {
        body.applyTorqueImpulse({ x: 0, y: -50000.0, z: 0 }, true); // Increased from -5000.0
    }

    // Apply stabilization torque
    body.applyTorqueImpulse({
        x: stabilizationTorque.x,
        y: stabilizationTorque.y,
        z: stabilizationTorque.z
    }, true);

    if (!impulse.equals(new THREE.Vector3(0, 0, 0))) {
        body.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
    }

    // Get car's position and rotation
    const carPos = body.translation();
    const carRot = body.rotation();
    
    // Get car's velocity and angular velocity
    const velocity = body.linvel();
    const angularVelocity = body.angvel();
    
    // Calculate speed and turning intensity
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    const turningIntensity = Math.abs(angularVelocity.y);
    
    // Generate skid marks when turning sharply or sliding
    if (speed > 5 && (turningIntensity > 1 || Math.abs(velocity.x) > 2 || Math.abs(velocity.z) > 2)) {
        // Create skid marks at both back tires
        const backward = new THREE.Vector3(0, 0, -1);
        const quaternion = new THREE.Quaternion(carRot.x, carRot.y, carRot.z, carRot.w);
        const rotatedBackward = backward.clone().applyQuaternion(quaternion).normalize();
        
        // Calculate positions for both rear tires (offset to left and right)
        const right = new THREE.Vector3(1, 0, 0);
        const rotatedRight = right.clone().applyQuaternion(quaternion).normalize();
        
        // Left rear tire position
        const leftSkidPosition = {
            x: carPos.x + rotatedBackward.x * 2 - rotatedRight.x * 1.5,
            y: carPos.y,
            z: carPos.z + rotatedBackward.z * 2 - rotatedRight.z * 1.5
        };
        
        // Right rear tire position
        const rightSkidPosition = {
            x: carPos.x + rotatedBackward.x * 2 + rotatedRight.x * 1.5,
            y: carPos.y,
            z: carPos.z + rotatedBackward.z * 2 + rotatedRight.z * 1.5
        };
        
        // Calculate skid mark rotation based on car's movement direction
        const skidRotation = {
            x: Math.PI / 2, // Rotate to lay flat on ground
            y: Math.atan2(velocity.x, velocity.z), // Align with movement direction
            z: 0
        };
        
        // Create skid marks for both tires
        createSkidMark(leftSkidPosition, skidRotation);
        createSkidMark(rightSkidPosition, skidRotation);
    }
}

// Apply forces to the car based on physics
function applyCarForces() {
    if (!car || !carBodyHandle) return;

    const body = physicsWorld.world.bodies.get(carBodyHandle);
    if (!body) return;

    // Get car's current position and rotation
    const pos = body.translation();
    const rot = body.rotation();

    // Reset if invalid
    if (!isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) {
        console.warn("Invalid car position detected, resetting position");
        body.setTranslation({ x: 0, y: 15, z: 0 }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        return;
    }

    // Get current velocity
    const linvel = body.linvel();
    const speed = Math.sqrt(linvel.x * linvel.x + linvel.z * linvel.z);

    // Apply drag force (air resistance)
    const dragForce = 0.1;
    const drag = {
        x: -linvel.x * dragForce,
        y: -linvel.y * dragForce,
        z: -linvel.z * dragForce
    };
    body.applyImpulse(drag, true);

    // Apply gravity
    const gravity = { x: 0, y: -9.81, z: 0 };
    body.applyImpulse(gravity, true);

    // Apply ground friction
    if (pos.y < 1.0) { // If car is close to ground
        const friction = 0.5;
        const frictionForce = {
            x: -linvel.x * friction,
            y: 0,
            z: -linvel.z * friction
        };
        body.applyImpulse(frictionForce, true);
    }
}

// Update mesh positions from physics bodies
function updateMeshPositionsFromPhysics() {
    // Update local car position
    if (car && carBodyHandle) {
        const body = physicsWorld.world.bodies.get(carBodyHandle);
        if (body) {
            const pos = body.translation();
            const rot = body.rotation();
            
            car.position.set(pos.x, pos.y, pos.z);
            car.quaternion.set(rot.x, rot.y, rot.z, rot.w);

            // Send position update to server
            if (socket && myPlayerId) {
                // Only log occasionally to reduce spam
                if (Math.random() < 0.01) {
                    console.log("SIMPLE DEBUG: Sending position update:", {
                        id: myPlayerId,
                        pos: `(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`
                    });
                }
                
                const positionData = {
                    id: myPlayerId,
                    position: { x: pos.x, y: pos.y, z: pos.z },
                    rotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w }
                };
                socket.emit('updatePosition', positionData);
            }
        }
    }

    // Update other players' positions if needed
    for (const id in otherPlayers) {
        const otherPlayer = otherPlayers[id];
        
        if (otherPlayer && otherPlayer.body && otherPlayer.mesh && !otherPlayer.isTemporary) {
            // Update mesh from physics body
            const pos = otherPlayer.body.translation();
            const rot = otherPlayer.body.rotation();
            
            otherPlayer.mesh.position.set(pos.x, pos.y, pos.z);
            otherPlayer.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        }
    }

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (bullet.body && bullet.mesh) {
            const pos = bullet.body.translation();
            const rot = bullet.body.rotation();
            
            // Update mesh position and rotation
            bullet.mesh.position.set(pos.x, pos.y, pos.z);
            bullet.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
            
            // Ensure bullet is visible
            bullet.mesh.visible = true;
            bullet.mesh.material.needsUpdate = true;
            
            // Remove bullet if it's too old or out of bounds
            const now = Date.now();
            if (now - bullet.spawnTime > BULLET_LIFETIME || 
                Math.abs(pos.x) > 1000 || 
                Math.abs(pos.y) > 1000 || 
                Math.abs(pos.z) > 1000) {
                console.log('[DEBUG] Removing bullet:', bullet.id);
                removeBullet(bullet);
            }
        }
    }
}

// Modify the animate function to send position updates
function animate() {
    requestAnimationFrame(animate);

    try {
        // 1. Handle input and game logic
        updateControls();

        // 2. Apply forces or impulses to bodies
        applyCarForces();

        // 3. Step physics
        if (physicsWorld && physicsWorld.world) {
            try {
                physicsWorld.step();
            } catch (error) {
                console.error("Physics step error:", error);
                return;
            }
        }

        // 4. Update mesh positions from physics
        updateMeshPositionsFromPhysics();

        // 5. Update camera
        updateCamera();

        // 6.5 Check bullet collisions
        checkBulletCollisions();

        // 6. Update skid marks
        updateSkidMarks();

        // 6. Render
        renderer.render(scene, camera);
    } catch (error) {
        console.error("Error in animation loop:", error);
    }
}

// Modify the initialization to include socket setup
physicsWorld.init().then(async () => {
    try {
        initSocket(); // Initialize socket connection
        setupControls();
        await loadLandscape();
        await loadCar();
        animate();
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    physicsWorld.cleanup();
});


function checkBulletCollisions() {
    bullets.forEach((bullet) => {
        // Check if bullet is still in cooldown for self-hit
        const cooldownEnd = bulletCooldowns.get(bullet.id);
        const canHitSelf = !cooldownEnd || Date.now() > cooldownEnd;
        
        // Check collision with local player
        if (car && bullet.mesh && (bullet.owner !== myPlayerId || canHitSelf)) {
            // Get car's bounding box
            const carBox = new THREE.Box3().setFromObject(car);
            // Add some padding to the bounding box to make it easier to hit
            carBox.expandByScalar(1.0);
            
            // Check if bullet is inside car's bounding box
            if (carBox.containsPoint(bullet.mesh.position)) {
                console.log('Bullet hit local player');
                
                // Emit bullet hit event to server with owner information
                socket.emit('bulletHit', {
                    bulletId: bullet.id,
                    hitPlayerId: myPlayerId,
                    attackerId: bullet.owner
                });
                
                removeBullet(bullet);
                return;
            }
        }
        
        // Check collision with other players
        for (const id in otherPlayers) {
            const other = otherPlayers[id];
            if (!other.mesh || !bullet.mesh) continue;

            // Get other player's bounding box
            const otherBox = new THREE.Box3().setFromObject(other.mesh);
            // Add some padding to the bounding box
            otherBox.expandByScalar(1.0);
            
            // Check if bullet is inside other player's bounding box
            if (otherBox.containsPoint(bullet.mesh.position)) {
                console.log('Bullet hit player:', id);

                // Emit bullet hit event to server with owner information
                socket.emit('bulletHit', {
                    bulletId: bullet.id,
                    hitPlayerId: id,
                    attackerId: bullet.owner
                });

              

                removeBullet(bullet);
                break;
            }
        }
    });
}

function createSkidMark(position, rotation) {
    const skidMark = new THREE.Mesh(skidMarkGeometry, skidMarkMaterial);
    skidMark.position.set(position.x, position.y + 0.01, position.z); // Slightly above ground
    skidMark.rotation.set(rotation.x, rotation.y, rotation.z);
    skidMark.spawnTime = Date.now();
    scene.add(skidMark);
    skidMarks.push(skidMark);
    
    // Remove oldest skid mark if we've reached the maximum
    if (skidMarks.length > MAX_SKID_MARKS) {
        const oldestSkidMark = skidMarks.shift();
        scene.remove(oldestSkidMark);
    }
}

function updateSkidMarks() {
    const now = Date.now();
    for (let i = skidMarks.length - 1; i >= 0; i--) {
        const skidMark = skidMarks[i];
        const age = now - skidMark.spawnTime;
        
        // Fade out skid marks over time
        skidMark.material.opacity = 0.8 * (1 - age / SKID_MARK_LIFETIME);
        
        // Remove old skid marks
        if (age > SKID_MARK_LIFETIME) {
            scene.remove(skidMark);
            skidMarks.splice(i, 1);
        }
    }
}
