import * as RAPIER from '@dimforge/rapier3d-compat';

let world;

export const physicsWorld = {
    async init() {
        await RAPIER.init();
        
        const gravity = new RAPIER.Vector3(0, -20.0, 0);
        world = new RAPIER.World(gravity);
        this.world = world;
        
        return this;
    },

    step() {
        if (world) {
            world.step();
        }
    },

    createGroundCuboid({ width = 100, height = 1, depth = 100, position = { x: 0, y: -1, z: 0 } } = {}) {
        if (!world) return;

        const groundBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z);
        const groundBody = world.createRigidBody(groundBodyDesc);

        const groundColliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
            .setRestitution(0.1)
            .setFriction(1.0);
        world.createCollider(groundColliderDesc, groundBody);

        return groundBody.handle;
    },

    createSphereBody(position, radius = 2) {
        if (!world) return null;

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(position.x, position.y, position.z)
            .setLinearDamping(0.01)
            .setAngularDamping(0.01)
            .setCanSleep(true)
            .setCcdEnabled(true);

        const body = world.createRigidBody(bodyDesc);

        const colliderDesc = RAPIER.ColliderDesc.ball(radius)
            .setRestitution(0.6)
            .setFriction(0.4)
            .setDensity(1.0);

        world.createCollider(colliderDesc, body);

        return body.handle;
    },

    getBodyState(handle) {
        if (!world || !world.bodies.contains(handle)) return null;

        const body = world.bodies.get(handle);
        const pos = body.translation();
        const rot = body.rotation();

        return {
            position: { x: pos.x, y: pos.y, z: pos.z },
            rotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w }
        };
    },

    containsBody(handle) {
        return world && world.bodies.contains(handle);
    },

    removeRigidBody(handle) {
        if (world && world.bodies.contains(handle)) {
            world.removeRigidBody(world.bodies.get(handle), true);
        }
    },

    cleanup() {
        if (world) {
            world.free();
            world = null;
            this.world = null;
        }
    }
};

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
                
                // Create physics body
                const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
                    .setTranslation(center.x, center.y, center.z)
                    .setLinearDamping(0.05)
                    .setAngularDamping(0.05)
                    .setCanSleep(false)
                    .setCcdEnabled(true)
                    .setGravityScale(0.5); // Reduced gravity effect on the car
                
                const body = physicsWorld.world.createRigidBody(bodyDesc);
                
                // Create collider
                const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
                    .setRestitution(0.1)
                    .setFriction(0.5)
                    .setDensity(10.0);
                
                physicsWorld.world.createCollider(colliderDesc, body);
                
                carBodyHandle = body.handle;
                
                console.log('Car loaded with physics, handle:', carBodyHandle);
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