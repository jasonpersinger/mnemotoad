"""Independent stdlib reader for generated SMF export validation, not the production codec."""
import json, struct, sys
from pathlib import Path

def inspect(path):
    raw=Path(path).read_bytes(); pos=0
    def take(n):
        nonlocal pos
        assert 0<=n<=len(raw)-pos,'Truncated MIDI'
        value=raw[pos:pos+n];pos+=n;return value
    def number(n): return int.from_bytes(take(n),'big')
    def variable():
        value=0
        for _ in range(4):
            b=number(1);value=(value<<7)|(b&127)
            if not b&128:return value
        raise AssertionError('Overlong delta')
    assert take(4)==b'MThd'; header_length=number(4);assert header_length>=6
    fmt,tracks,ppq=struct.unpack('>HHH',take(6));take(header_length-6)
    assert fmt in (0,1) and 0<ppq<32768
    result={'format':fmt,'ppq':ppq,'tracks':[],'notes':[],'tempos':[],'meters':[]}
    for track in range(tracks):
        assert take(4)==b'MTrk';length=number(4);limit=pos+length;assert limit<=len(raw)
        tick=0;running=None;active={};ending=False;name='';order=[]
        while pos<limit:
            tick+=variable();status=number(1)
            if status<128:assert running is not None;pos-=1;status=running
            if status==255:
                running=None;kind=number(1);payload=take(variable())
                if kind==3:name=payload.decode('utf-8')
                if kind==81:assert len(payload)==3;result['tempos'].append([tick,int.from_bytes(payload,'big')])
                if kind==88:assert len(payload)==4;result['meters'].append([tick,payload[0],2**payload[1]])
                if kind==47:assert not payload and pos==limit;ending=True
            elif status in (240,247):running=None;take(variable())
            else:
                assert 128<=status<240;running=status;kind=status>>4;channel=status&15
                a=number(1);b=number(1) if kind not in (12,13) else 0;assert a<128 and b<128
                if kind in (8,9):
                    on=kind==9 and b>0;key=(channel,a);order.append([tick,'on' if on else 'off',channel,a,b])
                    if on:assert key not in active;active[key]=(tick,b)
                    else:
                        assert key in active;start,velocity=active.pop(key);assert tick>start
                        result['notes'].append({'channel':channel,'pitch':a,'startTick':start,'durationTicks':tick-start,'velocity':velocity})
        assert ending and not active and pos==limit
        result['tracks'].append({'name':name,'endTick':tick,'events':order})
    assert pos==len(raw)
    result['notes'].sort(key=lambda n:(n['startTick'],n['pitch'],n['channel']))
    return result
if __name__=='__main__':print(json.dumps(inspect(sys.argv[1]),ensure_ascii=False))
