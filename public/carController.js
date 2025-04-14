import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';

export class CarController {
    constructor(scene, world, loader) {
        this.scene = scene;
        this.world = world;
        this.loader = loader;
        this.modelPath = 'car2.glb';
        this.car = {
            mesh: null,
            rigidBodyHandle: null,
            speed: 0,
            maxSpeed: 30,
            acceleration: 20,
            turnSpeed: 2.0
        };
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false
        };
        this.lastCollisionTime = 0;
        this.trails = [];
        this.originalMaterial = null;
        this.raycasters = [];
        this.rayLength = 5.0;
        this.rayDirections = [
            new THREE.Vector3(0, 0, -1),
            new THREE.Vector3(-0.5, 0, -0.5),
            new THREE.Vector3(0.5, 0, -0.5),
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(-0.5, 0, 0.5),
            new THREE.Vector3(0.5, 0, 0.5)
        ];
        this.cameraTarget = new THREE.Object3D();
        this.scene.add(this.cameraTarget);
        this.setupInput();
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            if (e.key in this.keys) {
                this.keys[e.key] = true;
                console.log(`Key pressed: ${e.key.toUpperCase()}`);
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.key in this.keys) {
                this.keys[e.key] = false;
                console.log(`Key released: ${e.key.toUpperCase()}`);
            }
        });
    }

    setupRaycasters() {
        // Create raycasters for each direction
        this.rayDirections.forEach((direction) => {
            const raycaster = new THREE.Raycaster();
            this.raycasters.push(raycaster);
        });
    }

    updateRaycasters() {
        if (!this.car.mesh) return;

        const carPosition = this.car.mesh.position;
        const carRotation = this.car.mesh.quaternion;

        this.rayDirections.forEach((direction, index) => {
            const raycaster = this.raycasters[index];

            // Update ray direction based on car rotation
            const rayDirection = direction.clone().applyQuaternion(carRotation);
            raycaster.set(carPosition, rayDirection);

            // Check for intersections
            const intersects = raycaster.intersectObjects(this.scene.children, true);
            if (intersects.length > 0 && intersects[0].distance < this.rayLength) {
                this.handleRayCollision(intersects[0], index);
            }
        });
    }

    handleRayCollision(intersect, rayIndex) {
        const now = Date.now();
        if (now - this.lastCollisionTime < 500) return; // Debounce collisions

        // Adjust speed based on ray collision
        if (rayIndex < 3) { // Forward rays
            this.car.speed *= 0.5; // Reduce speed more when hitting obstacles in front
        } else { // Backward rays
            this.car.speed *= 0.7; // Less reduction when hitting obstacles behind
        }

        this.lastCollisionTime = now;
    }

    async load() {
        return new Promise((resolve) => {
            // Check if physics world is initialized
            if (!this.world || !this.world.world) {
                console.error("Physics world not initialized");
                resolve();
                return;
            }

            this.loader.load(this.modelPath, (gltf) => {
                const carMesh = gltf.scene;
                carMesh.scale.set(1, 1, 1);
                carMesh.position.set(0, 20, 0);
                carMesh.rotation.y = Math.PI;
                carMesh.traverse((c) => {
                    if (c.isMesh) {
                        c.castShadow = true;
                        c.receiveShadow = true;
                        this.originalMaterial = c.material.clone();
                    }
                });

                this.scene.add(carMesh);

                this.debugBox = new THREE.Box3Helper(new THREE.Box3().setFromObject(carMesh), 0xffff00);
                this.scene.add(this.debugBox);

                const carSize = { x: 1.5, y: 0.6, z: 3.0 };
                const initialPosition = { x: 0, y: 20, z: 0 };
                const initialRotation = { x: 0, y: Math.PI, z: 0 };

                try {
                    // Create rigid body with more stable settings
                    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
                        .setTranslation(initialPosition.x, initialPosition.y, initialPosition.z)
                        .setRotation(initialRotation)
                        .setLinearDamping(0.5)  // Increased damping for stability
                        .setAngularDamping(0.5) // Increased angular damping
                        .setCanSleep(false)
                        .setCcdEnabled(true)    // Enable continuous collision detection
                        .setGravityScale(1.0);  // Explicitly set gravity scale

                    const body = this.world.world.createRigidBody(bodyDesc);
                    if (!body) {
                        throw new Error("Failed to create rigid body");
                    }

                    // Create collider with more stable settings
                    const colliderDesc = RAPIER.ColliderDesc.cuboid(carSize.x / 2, carSize.y / 2, carSize.z / 2)
                        .setRestitution(0.1)    // Reduced bounce
                        .setFriction(0.8)       // Increased friction
                        .setDensity(100.0)      // Increased density for stability
                        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

                    const collider = this.world.world.createCollider(colliderDesc, body);
                    if (!collider) {
                        throw new Error("Failed to create collider");
                    }

                    // Verify body exists in world
                    if (!this.world.world.bodies.contains(body.handle)) {
                        throw new Error("Body not found in physics world after creation");
                    }

                    // Initialize car properties with more conservative values
                    this.car.mesh = carMesh;
                    this.car.rigidBodyHandle = body.handle;
                    this.car.speed = 0;
                    this.car.maxSpeed = 20;     // Reduced max speed
                    this.car.acceleration = 15; // Reduced acceleration
                    this.car.turnSpeed = 1.5;   // Reduced turn speed

                    // Create skid trails and setup raycasters
                    this.createSkidTrails();
                    this.setupRaycasters();

                    console.log("Car loaded successfully with handle:", body.handle);
                    resolve();
                } catch (error) {
                    console.error("Error creating car physics:", error);
                    resolve(); // Still resolve to prevent hanging
                }
            });
        });
    }

    createSkidTrails() {
        class Trail {
            constructor(scene, color = 0x000000) {
                this.points = [];
                this.maxPoints = 40;
                const geometry = new THREE.BufferGeometry();
                const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
                this.line = new THREE.Line(geometry, material);
                scene.add(this.line);
            }
            update(point) {
                this.points.push(point.clone());
                if (this.points.length > this.maxPoints) this.points.shift();
                const positions = new Float32Array(this.points.length * 3);
                this.points.forEach((p, i) => {
                    positions.set([p.x, p.y, p.z], i * 3);
                });
                this.line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                this.line.geometry.setDrawRange(0, this.points.length);
                this.line.geometry.attributes.position.needsUpdate = true;
            }
        }
        this.trails.push(new Trail(this.scene)); // left
        this.trails.push(new Trail(this.scene)); // right
    }

    handleCollision() {
        const now = Date.now();
        if (now - this.lastCollisionTime < 500) return; // Debounce collisions
        this.lastCollisionTime = now;

        // Reduce speed on collision
        this.car.speed *= 0.3; // More aggressive speed reduction
    }

    update(delta = 1 / 60) {
        const car = this.car;
        
        // Check if car is properly initialized
        if (!car.mesh || !car.rigidBodyHandle) {
            console.error("Car not properly initialized");
            return;
        }

        // Check if physics world is available
        if (!this.world || !this.world.world) {
            console.error("Physics world not available");
            return;
        }

        // Get body state from physics world
        const bodyState = this.world.getBodyState(car.rigidBodyHandle);
        if (!bodyState) {
            console.error("Failed to get car body state");
            return;
        }

        // Update car mesh position and rotation
        car.mesh.position.set(
            bodyState.position.x,
            bodyState.position.y,
            bodyState.position.z
        );
        car.mesh.quaternion.set(
            bodyState.rotation.x,
            bodyState.rotation.y,
            bodyState.rotation.z,
            bodyState.rotation.w
        );

        // Update raycasters before applying forces
        this.updateRaycasters();

        const body = this.world.world.bodies.get(car.rigidBodyHandle);
        if (!body) {
            console.error("Failed to get car body from handle");
            return;
        }

        const rotation = body.rotation();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
            new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
        ).normalize();

        // Handle acceleration
        if (this.keys.w) {
            car.speed = Math.min(car.speed + car.acceleration * delta, car.maxSpeed);
        } else if (this.keys.s) {
            car.speed = Math.max(car.speed - car.acceleration * delta, -car.maxSpeed / 2);
        } else {
            car.speed *= 0.95; // Natural deceleration
        }

        // Handle turning
        if (this.keys.a || this.keys.d) {
            const turnDirection = this.keys.a ? 1 : -1;
            const turnAmount = car.turnSpeed * (car.speed / car.maxSpeed) * delta;
            body.applyTorqueImpulse({ x: 0, y: turnDirection * turnAmount, z: 0 }, true);
        }

        // Apply forward/backward impulse
        if (Math.abs(car.speed) > 0.1) {
            const impulse = forward.multiplyScalar(car.speed * 200 * delta);
            body.applyImpulse(impulse, true);
        }

        // Apply downforce to prevent flipping
        body.applyImpulse({ x: 0, y: -5 * delta, z: 0 }, true);
        
        // Update debug box helper
        if (this.debugBox) {
            this.debugBox.box.setFromObject(this.car.mesh);
            this.debugBox.updateMatrixWorld(true);
        }

        // Check for collisions using the world's event queue
        const eventQueue = this.world.world.eventQueue;
        if (eventQueue) {
            while (eventQueue.hasActiveCollisionEvents()) {
                const event = eventQueue.nextCollisionEvent();
                if (event) {
                    console.log("Collision detected!");
                    this.handleCollision();
                }
            }
        }

        // Drift logic
        const drifting = Math.abs(car.speed) > 5 && (this.keys.a || this.keys.d) && !this.keys.w;

        const colliderHandle = body.colliderHandles?.[0];
        if (colliderHandle !== undefined) {
            const collider = this.world.world.colliders.get(colliderHandle);
            if (collider) {
                collider.setFriction(drifting ? 0.2 : 0.8);
            }
        }

        if (drifting && this.trails.length === 2) {
            const q = car.mesh.quaternion;
            const leftOffset = new THREE.Vector3(-1, -0.5, -2).applyQuaternion(q);
            const rightOffset = new THREE.Vector3(1, -0.5, -2).applyQuaternion(q);

            this.trails[0].update(car.mesh.position.clone().add(leftOffset));
            this.trails[1].update(car.mesh.position.clone().add(rightOffset));
        }
    }

    followCamera(camera) {
        if (!this.car.mesh) return;

        const carPosition = this.car.mesh.position.clone();
        const carQuaternion = this.car.mesh.quaternion;

        // Calculate camera position behind and above the car
        const backOffset = new THREE.Vector3(0, 5, 20).applyQuaternion(carQuaternion);
        const targetPosition = carPosition.clone().add(backOffset);

        // Smoothly move camera target
        this.cameraTarget.position.lerp(targetPosition, 0.1);
        
        // Smoothly move camera
        camera.position.lerp(this.cameraTarget.position, 0.05);
        
        // Look at car
        camera.lookAt(carPosition);
    }
} 