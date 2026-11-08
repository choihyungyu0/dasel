#!/usr/bin/env bash
# 시연 영상 편집. 실행(저장소 루트): bash scripts/demo/edit.sh
# 입력 screenshots/demo/raw_main.webm + scenes_main.json(record.mjs가 만든 장면 시각) → scenes/*.mp4, dasel_demo.mp4
set -euo pipefail
D=screenshots/demo
rm -rf "$D/scenes"; mkdir -p "$D/scenes"
mkdir -p "$D/fonts"; cp -n /c/Windows/Fonts/malgunbd.ttf /c/Windows/Fonts/malgun.ttf "$D/fonts/" 2>/dev/null || true
FONT="$D/fonts/malgunbd.ttf"
FONTR="$D/fonts/malgun.ttf"
ENC="-c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -r 30 -an"

# 장면별 배속(길면 줄임). 카메라 이동 장면(4)은 자르지 않고 배속만
node -e '
const { scenes } = require("./'"$D"'/scenes_main.json");
// 배속: 카메라 비행·패널·카운트업(3, 5)과 AI 응답 장면(9)은 1.0. 원본 최대 길이(초)
const speed = { "1_tour": 1.3, "2_3d": 1.7, "3_top30": 1, "4_nl": 1.3, "5_building": 1, "6_ai": 1, "7_adjust": 1.3, "8_opinion": 1.6, "9_ask": 1 };
const maxLen = { "3_top30": 9.5 };
for (const s of scenes) console.log([s.name, s.start, Math.min(s.end - s.start, maxLen[s.name] ?? 99).toFixed(2), speed[s.name] ?? 1].join(" "));
' > "$D/cuts.txt"

i=1
while read -r name start dur sp; do
  f=$(printf "%s/scenes/%02d_%s.mp4" "$D" "$i" "$name")
  ffmpeg -loglevel error -y -ss "$start" -t "$dur" -i "$D/raw_main.webm" -vf "setpts=PTS/$sp,fps=30,scale=1920:1080$( [ "$name" = 9_ask ] && echo ',tpad=stop_mode=clone:stop_duration=1' )" $ENC "$f"
  i=$((i+1))
done < "$D/cuts.txt"

card () { # 파일 길이 큰글씨 작은글씨1 작은글씨2
  ffmpeg -loglevel error -y -f lavfi -i "color=white:s=1920x1080:d=$2:r=30" -vf \
"drawtext=fontfile=$FONT:text='$3':fontcolor=0x0b5d33:fontsize=150:x=(w-tw)/2:y=360,\
drawtext=fontfile=$FONTR:text='$4':fontcolor=0x1f2937:fontsize=44:x=(w-tw)/2:y=600,\
drawtext=fontfile=$FONTR:text='$5':fontcolor=0x4b5563:fontsize=36:x=(w-tw)/2:y=690" $ENC "$1"
}
card "$D/scenes/00_title.mp4" 2 "다셀" "산단 공장 지붕 태양광·재사용 배터리 설치 우선순위 지도" "팀 가온"
card "$D/scenes/99_end.mp4" 3 "다셀" "dasel-weld.vercel.app" "공공데이터 10종 · AI 영상 판독 · 1차 검토 도구(현장·구조검토 전)"

# 0.25초 크로스페이드로 이어 붙이기
mapfile -t FILES < <(ls "$D"/scenes/*.mp4 | sort)
node -e '
const { execFileSync } = require("child_process");
const files = process.argv.slice(1);
const dur = files.map((f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const X = 0.25;
let chain = "", off = 0, prev = "[0:v]";
for (let k = 1; k < files.length; k++) {
  off += dur[k - 1] - X;
  const out = k === files.length - 1 ? "[v]" : `[x${k}]`;
  chain += `${prev}[${k}:v]xfade=transition=fade:duration=${X}:offset=${off.toFixed(3)}${out};`;
  prev = out;
  if (k === 1) off = dur[0] - X; else off = off;
}
console.log(chain.slice(0, -1));
' "${FILES[@]}" > "$D/xfade.txt"

ARGS=()
for f in "${FILES[@]}"; do ARGS+=(-i "$f"); done
ffmpeg -loglevel error -y "${ARGS[@]}" -filter_complex "$(cat "$D/xfade.txt")" -map "[v]" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -r 30 -movflags +faststart -an "$D/dasel_demo.mp4"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$D/dasel_demo.mp4"
