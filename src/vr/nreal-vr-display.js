
import { VRFrameData, VRDisplay, VRDisplayCapabilities } from '../../webxr-samples/webvr/cardboard-vr-display/src/base.js';

import NRDevice from '../devices/NRDevice';
import { vec3, quat, mat4 } from 'gl-matrix/src/gl-matrix';
import XRWebGLLayer from '../api/XRWebGLLayer.js';

var Eye = {
    LEFT: 'left',
    RIGHT: 'right'
};

function NrealVRDisplay(global) {
    VRDisplay.call(this, {
        wakelock: true,
        forceNreal:true,
    });
    this.global = global;
    console.log('create nreal vr display.');

    this.displayName = 'Nreal VRDisplay';
    this.capabilities = new VRDisplayCapabilities({
        hasPosition: true,
        hasOrientation: true,
        hasExternalDisplay: true,
        canPresent: true,
        maxLayers: 1
    });
    this.session = null;
    this.xrDevice = new NRDevice(this.global);
}
NrealVRDisplay.prototype = Object.create(VRDisplay.prototype);



NrealVRDisplay.prototype.getFrameData = function (frameData) {
    this.xrDevice.updateFrameData(this.depthNear,this.depthFar);

    frameData.leftProjectionMatrix = this.xrDevice.getProjectionMatrix(Eye.LEFT);
    frameData.rightProjectionMatrix = this.xrDevice.getProjectionMatrix(Eye.RIGHT);

    frameData.leftViewMatrix = this.xrDevice.getBaseViewMatrix(Eye.LEFT);
    frameData.rightViewMatrix = this.xrDevice.getBaseViewMatrix(Eye.RIGHT);

    frameData.pose = this._getPose();
    return true;
}

NrealVRDisplay.prototype._getPose = function () {
    var mat = this.xrDevice.getBasePoseMatrix();
    var pose = vec3.create();
    var ori = quat.create();


    mat4.getTranslation(pose, mat);
    mat4.getRotation(ori, mat);

    return {
        position: pose,
        orientation: ori,
        linearVelocity: null,
        linearAcceleration: null,
        angularVelocity: null,
        angularAcceleration: null
    };
}


NrealVRDisplay.prototype.getEyeParameters = function (whichEye) {
    var offset = [this.xrDevice.getEyePoseFromHead(whichEye)[3], 0, 0];
    var fieldOfView = this.xrDevice.getEyeFov(whichEye);
    var degrees = new Float32Array(4);

    const toDegree = 180 / Math.PI;
    for (let i = 0 ;i <4;i++){
        degrees[i] = Math.atan(fieldOfView[i]) *toDegree;
    }
    var eyeParams = {
        offset: offset,
        // TODO: Should be able to provide better values than these.
        renderWidth: 512,
        renderHeight: 512,
    };

    Object.defineProperty(eyeParams, 'fieldOfView', {
        enumerable: true,
        get: function () {
            // Util.deprecateWarning('VRFieldOfView',
            //     'VRFrameData\'s projection matrices');
            return degrees;
        },
    });

    return eyeParams;

};

NrealVRDisplay.prototype.requestAnimationFrame = function (callback) {
    return this.xrDevice.requestAnimationFrame(callback);
};
NrealVRDisplay.prototype.cancelAnimationFrame = function (id) {
    return this.xrDevice.cancelAnimationFrame(id);
};

NrealVRDisplay.prototype.beginPresent_ = function (layers) {
   return this.xrDevice.requestSession('immersive-vr').then((sessionId) => {
        this.session =this.xrDevice.sessions.get(sessionId);

        var gl = this.layer_.source.getContext('webgl');
        if (!gl)
          gl = this.layer_.source.getContext('experimental-webgl');
        if (!gl)
          gl = this.layer_.source.getContext('webgl2');

        // return this.xrDevice.onBaseLayerSet(sessionId,new XRWebGLLayer(this.session,gl));
    });
};
NrealVRDisplay.prototype.endPresent_ = function () {
    return this.xrDevice.endSession(this.session.Id);
};

NrealVRDisplay.prototype.submitFrame = function() {
    // return this.xrDevice.onFrameStart()

};

NrealVRDisplay.VRFrameData = VRFrameData;
NrealVRDisplay.VRDisplay = VRDisplay;



export default NrealVRDisplay;