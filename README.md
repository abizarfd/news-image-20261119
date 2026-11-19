# The World in One Day — Thursday 19 November 2026

A program that draws one newspaper front page summing up the world news of 19 November 2026. Six stories, drawn pixel by pixel: no fonts, no images from the internet, no network at all.

How to run it:

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

It writes `out/entry.png` (1024x1024). Run it twice and you get the exact same bytes both times. That is the point: the picture is fully deterministic.

Built for the make.fun news-image-20261119 competition. Submitted 19 Nov 2026.
