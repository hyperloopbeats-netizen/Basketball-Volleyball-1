import * as THREE from 'three';

export interface ChibiShaderUniforms {
  uTime: { value: number };
  uSquashStretch: { value: number };
  uReadiness: { value: number };
  uAtpFlux: { value: number };
  uTeamAccent: { value: THREE.Color };
}

/**
 * CharacterShaderRig
 * Extends Three.js MeshStandardMaterial via `onBeforeCompile` for Chibi-Voxel / PS6
 * stylized athlete shading: elastic jump squash-stretch vertex kinetic + Fresnel rim bioluminescence
 * while preserving full PBR shadows, roughness, and RoomEnvironment reflections.
 */
export class CharacterShaderRig {
  private readonly sharedUniforms: {
    uTime: { value: number };
    uAtpFlux: { value: number };
  } = {
    uTime: { value: 0 },
    uAtpFlux: { value: 0.98 },
  };

  private readonly unitUniforms = new Map<
    number,
    { uSquashStretch: { value: number }; uReadiness: { value: number }; uSweatLevel: { value: number } }
  >();

  public enhanceJerseyMaterial(
    mat: THREE.MeshStandardMaterial,
    unitKey: number,
    teamColorHex: number
  ): THREE.MeshStandardMaterial {
    let perUnit = this.unitUniforms.get(unitKey);
    if (!perUnit) {
      perUnit = {
        uSquashStretch: { value: 0.0 },
        uReadiness: { value: 0.9 },
        uSweatLevel: { value: 0.0 },
      };
      this.unitUniforms.set(unitKey, perUnit);
    }

    const accent = new THREE.Color(teamColorHex);

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.sharedUniforms.uTime;
      shader.uniforms.uAtpFlux = this.sharedUniforms.uAtpFlux;
      shader.uniforms.uSquashStretch = perUnit!.uSquashStretch;
      shader.uniforms.uReadiness = perUnit!.uReadiness;
      shader.uniforms.uSweatLevel = perUnit!.uSweatLevel;
      shader.uniforms.uTeamAccent = { value: accent };

      shader.vertexShader =
        `
        uniform float uSquashStretch;
        varying float vChibiRimHeight;
        ` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          float sFactor = clamp(uSquashStretch, -0.18, 0.22);
          transformed.y *= (1.0 + sFactor);
          float invXZ = 1.0 - sFactor * 0.42;
          transformed.x *= invXZ;
          transformed.z *= invXZ;
          vChibiRimHeight = clamp(transformed.y * 2.0, 0.0, 1.0);
          `
        );

      shader.fragmentShader =
        `
        uniform float uTime;
        uniform float uAtpFlux;
        uniform float uReadiness;
        uniform float uSweatLevel;
        uniform vec3 uTeamAccent;
        varying float vChibiRimHeight;
        ` +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `
          #include <emissivemap_fragment>
          vec3 nrm = normalize(vNormal);
          vec3 vDir = normalize(vViewPosition);
          float rim = pow(1.0 - max(0.0, abs(dot(nrm, vDir))), 2.6);
          float pulse = 0.72 + 0.28 * sin(uTime * 4.5 + vChibiRimHeight * 6.0);
          totalEmissiveRadiance += uTeamAccent * rim * (0.14 + 0.22 * uReadiness) * uAtpFlux * pulse;
          // Sweat sheen glistening along shoulders & rim as athlete exertion builds
          float sweatGlint = pow(max(0.0, dot(reflect(-vDir, nrm), normalize(vec3(0.4, 0.9, 0.3)))), 14.0);
          totalEmissiveRadiance += vec3(0.75, 0.92, 1.0) * (sweatGlint * 0.45 + rim * 0.22) * uSweatLevel;
          `
        );
    };

    mat.customProgramCacheKey = () => `chibi_ps6_${unitKey}`;
    return mat;
  }

  public update(timeSec: number, atpFlux: number) {
    this.sharedUniforms.uTime.value = timeSec;
    this.sharedUniforms.uAtpFlux.value = THREE.MathUtils.clamp(atpFlux, 0.35, 1.35);
  }

  public updateUnitState(
    unitKey: number,
    squashStretch: number,
    readiness01: number,
    sweatLevel01 = 0
  ) {
    const entry = this.unitUniforms.get(unitKey);
    if (!entry) return;
    entry.uSquashStretch.value = THREE.MathUtils.clamp(squashStretch, -0.18, 0.22);
    entry.uReadiness.value = THREE.MathUtils.clamp(readiness01, 0, 1);
    entry.uSweatLevel.value = THREE.MathUtils.clamp(sweatLevel01, 0, 1);
  }
}
