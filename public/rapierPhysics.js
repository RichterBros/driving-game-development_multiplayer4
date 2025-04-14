// Rapier Physics Implementation
import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';

// Initialize Rapier
let RAPIER_INITIALIZED = false;
export async function initRapier() {
    if (!RAPIER_INITIALIZED) {
        await RAPIER.init({
            wasmUrls: {
                physics: 'https://cdn.skypack.dev/@dimforge/rapier3d-compat/rapier_bg.wasm',
                worker: 'https://cdn.skypack.dev/@dimforge/rapier3d-compat/rapier_worker.js'
            }
        });
        RAPIER_INITIALIZED = true;
        console.log('Rapier physics initialized');
    }
    return RAPIER;
}

// Create a physics world
export function createPhysicsWorld(gravity = { x: 0, y: -9.81, z: 0 }) {
    const world = new RAPIER.World(gravity);
    return world;
}

// Create a static ground plane
export function createGroundPlane(world) {
    const groundColliderDesc = RAPIER.ColliderDesc.cuboid(250, 0.1, 250)
        .setTranslation(0, -0.1, 0)
        .setFriction(0.3)
        .setRestitution(0.1);
    
    world.createCollider(groundColliderDesc);
    return groundColliderDesc;
}

// Create a physics body for a mesh
export function createPhysicsBodyForMesh(world, mesh, options = {}) {
    const {
        mass = 0, // 0 for static bodies
        friction = 0.3,
        restitution = 0.1,
        isStatic = mass === 0,
        position = mesh.position,
        rotation = mesh.rotation,
        scale = mesh.scale
    } = options;

    // Create a rigid body
    const rigidBodyDesc = isStatic 
        ? RAPIER.RigidBodyDesc.fixed()
        : RAPIER.RigidBodyDesc.dynamic();
    
    rigidBodyDesc.setTranslation(position.x, position.y, position.z);
    
    // Apply rotation
    const quaternion = new THREE.Quaternion();
    quaternion.setFromEuler(rotation);
    rigidBodyDesc.setRotation(quaternion);
    
    const rigidBody = world.createRigidBody(rigidBodyDesc);
    
    // Create collider based on geometry type
    let colliderDesc;
    const geometry = mesh.geometry;
    
    if (geometry.type === 'BoxGeometry') {
        const width = geometry.parameters.width * scale.x / 2;
        const height = geometry.parameters.height * scale.y / 2;
        const depth = geometry.parameters.depth * scale.z / 2;
        colliderDesc = RAPIER.ColliderDesc.cuboid(width, height, depth);
    } 
    else if (geometry.type === 'SphereGeometry') {
        const radius = geometry.parameters.radius * Math.max(scale.x, scale.y, scale.z);
        colliderDesc = RAPIER.ColliderDesc.ball(radius);
    } 
    else if (geometry.type === 'CylinderGeometry') {
        const radius = geometry.parameters.radiusTop * scale.x;
        const height = geometry.parameters.height * scale.y / 2;
        colliderDesc = RAPIER.ColliderDesc.cylinder(height, radius);
    } 
    else if (geometry.type === 'ConeGeometry') {
        const radius = geometry.parameters.radius * scale.x;
        const height = geometry.parameters.height * scale.y;
        colliderDesc = RAPIER.ColliderDesc.cone(height / 2, radius);
    } 
    else {
        // For complex geometries, use a compound of simpler shapes
        const box = new THREE.Box3().setFromObject(mesh);
        const size = {
            x: (box.max.x - box.min.x) / 2,
            y: (box.max.y - box.min.y) / 2,
            z: (box.max.z - box.min.z) / 2
        };
        colliderDesc = RAPIER.ColliderDesc.cuboid(size.x, size.y, size.z);
    }
    
    // Set material properties
    colliderDesc.setFriction(friction);
    colliderDesc.setRestitution(restitution);
    
    // Create the collider and attach it to the rigid body
    const collider = world.createCollider(colliderDesc, rigidBody);
    
    return {
        rigidBody,
        collider,
        mesh
    };
}

// Create a car physics body
export function createCarPhysics(world, position = { x: 0, y: 3, z: 0 }) {
    // Create the car body
    const carBodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(0.3)
        .setAngularDamping(0.5);
    
    const carBody = world.createRigidBody(carBodyDesc);
    
    // Create the car collider
    const carColliderDesc = RAPIER.ColliderDesc.cuboid(1, 0.3, 2)
        .setFriction(0.3)
        .setRestitution(0.1);
    
    const carCollider = world.createCollider(carColliderDesc, carBody);
    
    // Create wheels
    const wheels = [];
    const wheelPositions = [
        { x: -1.5, y: -0.25, z: 1.2 },  // Front Left
        { x: -1.5, y: -0.25, z: -1.2 }, // Front Right
        { x: 1.5, y: -0.25, z: 1.2 },   // Back Left
        { x: 1.5, y: -0.25, z: -1.2 }   // Back Right
    ];
    
    wheelPositions.forEach(pos => {
        const wheelBodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(
                position.x + pos.x,
                position.y + pos.y,
                position.z + pos.z
            )
            .setLinearDamping(0.2)
            .setAngularDamping(0.2);
        
        const wheelBody = world.createRigidBody(wheelBodyDesc);
        
        const wheelColliderDesc = RAPIER.ColliderDesc.ball(0.4)
            .setFriction(0.8)
            .setRestitution(0.1);
        
        const wheelCollider = world.createCollider(wheelColliderDesc, wheelBody);
        
        wheels.push({
            rigidBody: wheelBody,
            collider: wheelCollider,
            position: pos
        });
    });
    
    return {
        carBody,
        carCollider,
        wheels
    };
}

// Create a bullet physics body
export function createBulletPhysics(world, position, direction, speed = 50) {
    const bulletBodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setLinearDamping(0.05)
        .setAngularDamping(0.05);
    
    const bulletBody = world.createRigidBody(bulletBodyDesc);
    
    const bulletColliderDesc = RAPIER.ColliderDesc.ball(0.3)
        .setFriction(0.3)
        .setRestitution(0.9);
    
    const bulletCollider = world.createCollider(bulletColliderDesc, bulletBody);
    
    // Apply initial velocity
    const velocity = { x: direction.x, y: direction.y, z: direction.z };
    const length = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
    velocity.x = (velocity.x / length) * speed;
    velocity.y = (velocity.y / length) * speed;
    velocity.z = (velocity.z / length) * speed;
    bulletBody.setLinvel(velocity, true);
    
    return {
        rigidBody: bulletBody,
        collider: bulletCollider
    };
}

// Create a ramp physics body
export function createRampPhysics(world, position, rotation, dimensions) {
    const rampBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y, position.z);
    
    // Apply rotation
    const quaternion = new THREE.Quaternion();
    quaternion.setFromEuler(rotation.x, rotation.y, rotation.z);
    rampBodyDesc.setRotation(quaternion);
    
    const rampBody = world.createRigidBody(rampBodyDesc);
    
    const rampColliderDesc = RAPIER.ColliderDesc.cuboid(
        dimensions.length / 2,
        dimensions.height / 2,
        dimensions.width / 2
    )
    .setFriction(0.3)
    .setRestitution(0.1);
    
    const rampCollider = world.createCollider(rampColliderDesc, rampBody);
    
    return {
        rigidBody: rampBody,
        collider: rampCollider
    };
}

// Update physics world
export function updatePhysicsWorld(world, deltaTime = 1/60) {
    try {
        // Ensure we're not in the middle of a physics step
        if (world) {
            world.step();
        }
    } catch (error) {
        console.error('Error updating physics world:', error);
    }
}

// Apply force to a rigid body
export function applyForce(rigidBody, force, isImpulse = false) {
    if (isImpulse) {
        rigidBody.applyImpulse(force, true);
    } else {
        rigidBody.applyForce(force, true);
    }
}

// Apply torque to a rigid body
export function applyTorque(rigidBody, torque, isImpulse = false) {
    if (isImpulse) {
        rigidBody.applyTorqueImpulse(torque, true);
    } else {
        rigidBody.applyTorque(torque, true);
    }
}

// Get position of a rigid body
export function getRigidBodyPosition(rigidBody) {
    const position = rigidBody.translation();
    return { x: position.x, y: position.y, z: position.z };
}

// Get rotation of a rigid body
export function getRigidBodyRotation(rigidBody) {
    const rotation = rigidBody.rotation();
    return { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w };
}

// Set position of a rigid body
export function setRigidBodyPosition(rigidBody, position) {
    rigidBody.setTranslation(position, true);
}

// Set rotation of a rigid body
export function setRigidBodyRotation(rigidBody, rotation) {
    rigidBody.setRotation(rotation, true);
}

// Remove a rigid body from the world
export function removeRigidBody(world, rigidBody) {
    world.removeRigidBody(rigidBody);
}

// Create a contact material
export function createContactMaterial(world, material1, material2, friction = 0.3, restitution = 0.1) {
    // Rapier doesn't have a direct equivalent to Cannon's contact materials
    // Instead, we set these properties on the colliders directly
    return {
        friction,
        restitution
    };
} 