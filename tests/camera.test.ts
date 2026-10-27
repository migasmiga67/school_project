import { describe,expect,it } from 'vitest';
import { OrbitCamera } from '../src/camera-controls';
import { createGame } from '../src/game';

describe('independent mouse camera',()=>{
 it('rotates horizontally and vertically with bounded pitch and zoom',()=>{
  const camera=new OrbitCamera();camera.rotate(200,100);
  expect(camera.yaw).toBeCloseTo(.6);expect(camera.pitch).toBeCloseTo(.63);
  for(let i=0;i<30;i++){camera.rotate(500,500);camera.zoomBy(500);}
  expect(camera.pitch).toBeLessThanOrEqual(1.2);expect(camera.zoom).toBe(2.1);expect(Math.abs(camera.yaw)).toBeLessThanOrEqual(Math.PI);
  for(let i=0;i<30;i++){camera.rotate(-500,-500);camera.zoomBy(-500);}
  expect(camera.pitch).toBeGreaterThanOrEqual(.08);expect(camera.zoom).toBe(.55);
 });
 it('does not follow a walking character when the character turns or strafes',()=>{
  const camera=new OrbitCamera(),state=createGame();state.player.mode='foot';state.player.vehicleId=null;
  camera.rotate(250,0);const yaw=camera.yaw;state.player.heading=-1.7;
  for(let i=0;i<300;i++)camera.update(state.player,1/60,0);
  expect(camera.yaw).toBe(yaw);
 });
 it('temporarily lets the driver look around before smoothly following the vehicle',()=>{
  const camera=new OrbitCamera(),state=createGame();camera.update(state.player,.1,8);camera.rotate(300,0);
  for(let i=0;i<120;i++)camera.update(state.player,1/60,8);
  expect(camera.yaw).toBeCloseTo(.9);
  for(let i=0;i<180;i++)camera.update(state.player,1/60,8);
  expect(camera.yaw).toBeLessThan(.1);
 });
 it('keeps the view fixed during an active drag and while paused',()=>{
  const camera=new OrbitCamera(),state=createGame();camera.update(state.player,.1,8);camera.rotate(300,0);
  for(let i=0;i<300;i++)camera.update(state.player,1/60,8,true);
  expect(camera.yaw).toBeCloseTo(.9);camera.update(state.player,0,8);expect(camera.yaw).toBeCloseTo(.9);
 });
 it('reframes each camera mode and ignores nonfinite pointer deltas',()=>{
  const camera=new OrbitCamera();camera.setMode(1,Math.PI/2);expect(camera.pitch).toBe(1);expect(camera.yaw).toBeCloseTo(Math.PI/2);
  camera.rotate(Infinity,0);camera.zoomBy(NaN);expect(camera.zoom).toBe(1);expect(camera.yaw).toBeCloseTo(Math.PI/2);
  camera.setMode(2,0);camera.rotate(0,-500);expect(camera.pitch).toBe(-1.1);
 });
});
