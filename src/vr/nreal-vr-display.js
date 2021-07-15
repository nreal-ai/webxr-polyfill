
import { VRFrameData, VRDisplay, VRDisplayCapabilities } from '../../webxr-samples/webvr/cardboard-vr-display/src/base.js';

function NrealVRDisplay(config = {}) {
    VRDisplay.call(this, {
        wakelock: true,
    });
    this.config = config;
    console.log('create nreal vr display.');

    this.displayName = 'Nreal VRDisplay';
    this.capabilities = new VRDisplayCapabilities({
        hasPosition: true,
        hasOrientation: true,
        hasExternalDisplay: true,
        canPresent: true,
        maxLayers: 1
    });
}
NrealVRDisplay.prototype = Object.create(VRDisplay.prototype);

NrealVRDisplay.prototype.getEyeParameters = function(whichEye) {
    var offset = 0.2;
    var fieldOfView = 45;

    var eyeParams = {
        offset: offset,
        // TODO: Should be able to provide better values than these.
        renderWidth: this.deviceInfo_.device.width * 0.5 * this.bufferScale_,
        renderHeight: this.deviceInfo_.device.height * this.bufferScale_,
    };

    Object.defineProperty(eyeParams, 'fieldOfView', {
        enumerable: true,
        get: function () {
            Util.deprecateWarning('VRFieldOfView',
                'VRFrameData\'s projection matrices');
            return fieldOfView;
        },
    });

    return eyeParams;

}


NrealVRDisplay.prototype._getPose = function() {
    // TODO: pose from hardware
    return {
        position: null,
        orientation: null,
        linearVelocity: null,
        linearAcceleration: null,
        angularVelocity: null,
        angularAcceleration: null
    };
}
NrealVRDisplay.VRFrameData = VRFrameData;
NrealVRDisplay.VRDisplay = VRDisplay;



export default NrealVRDisplay;