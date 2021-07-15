
import NrealVRDisplay from "./nreal-vr-display";


function WebVRPolyfill(config) {
    this.config = config;

    this.polyfillDisplays = [];
    this.enabled = false;


    // Must handle this in constructor before we start
    // destructively polyfilling `navigator`
    this.hasNative = 'getVRDisplays' in navigator;
    // Store initial references to native constructors
    // and functions
    this.native = {};
    this.native.getVRDisplays = navigator.getVRDisplays;
    this.native.VRFrameData = window.VRFrameData;
    this.native.VRDisplay = window.VRDisplay;


    this.enable();
    this.getVRDisplays().then(function (displays) {
        if (displays && displays[0] && displays[0].fireVRDisplayConnect_) {
            displays[0].fireVRDisplayConnect_();
        }
    });

    console.log('webvr polyfill');
}

WebVRPolyfill.prototype.getPolyfillDisplays = function () {
    if (this._polyfillDisplaysPopulated) {
        return this.polyfillDisplays;
    }

    this.polyfillDisplays.push(new NrealVRDisplay());

    this._polyfillDisplaysPopulated = true;
    return this.polyfillDisplays;

}


WebVRPolyfill.prototype.enable = function () {
    this.enabled = true;

    // Polyfill native VRDisplay.getFrameData when the platform
    // has native WebVR support, but for use with a polyfilled
    // CardboardVRDisplay
    if (this.hasNative && this.native.VRFrameData) {
        var NativeVRFrameData = this.native.VRFrameData;
        var nativeFrameData = new this.native.VRFrameData();
        var nativeGetFrameData = this.native.VRDisplay.prototype.getFrameData;

        // When using a native display with a polyfilled VRFrameData
        window.VRDisplay.prototype.getFrameData = function (frameData) {
            // This should only be called in the event of code instantiating
            // `window.VRFrameData` before the polyfill kicks in, which is
            // unrecommended, but happens anyway
            if (frameData instanceof NativeVRFrameData) {
                nativeGetFrameData.call(this, frameData);
                return;
            }

            /*
            Copy frame data from the native object into the polyfilled object.
            */

            nativeGetFrameData.call(this, nativeFrameData);
            frameData.pose = nativeFrameData.pose;
            copyArray(nativeFrameData.leftProjectionMatrix, frameData.leftProjectionMatrix);
            copyArray(nativeFrameData.rightProjectionMatrix, frameData.rightProjectionMatrix);
            copyArray(nativeFrameData.leftViewMatrix, frameData.leftViewMatrix);
            copyArray(nativeFrameData.rightViewMatrix, frameData.rightViewMatrix);
            //todo: copy
        };
    }

    // Provide navigator.getVRDisplays.
    navigator.getVRDisplays = this.getVRDisplays.bind(this);

    // Provide the `VRDisplay` object.
    window.VRDisplay = NrealVRDisplay.VRDisplay;

    // Provide the VRFrameData object.
    window.VRFrameData = NrealVRDisplay.VRFrameData;
}



WebVRPolyfill.prototype.getVRDisplays = function () {
    console.log('get vr display from nreal patch.');
    return Promise.resolve(this.getPolyfillDisplays());
}


WebVRPolyfill.version = '0.0.1';
WebVRPolyfill.VRFrameData = NrealVRDisplay.VRFrameData;
WebVRPolyfill.VRDisplay = NrealVRDisplay.VRDisplay;
export default WebVRPolyfill;