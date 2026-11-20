"""Turn the raw guide screenshots (from guideScreenshots.mjs) into the images used by README.md.

    python guideImages.py <screenshotDir> <imageDir>

Full-window shots become 1100-px-wide JPEGs, panel crops stay PNG, and the animation frames become
jakobshavn-anomaly.gif.
"""
import argparse
import glob
import os

from PIL import Image

fullShots = ['overview', 'vx', 'anomaly', 'animation', 'antarctica', 'tsx', 'readout', 'timeseries', 'background']
panelShots = ['panel-catalog', 'panel-color', 'panel-download', 'panel-sites']


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('src', help='directory written by guideScreenshots.mjs')
    parser.add_argument('dst', help='image directory, e.g. Documents/images')
    args = parser.parse_args()
    os.makedirs(args.dst, exist_ok=True)
    for name in fullShots:
        im = Image.open(f'{args.src}/{name}.jpg').convert('RGB')
        if im.width > 1100:
            im = im.resize((1100, round(im.height * 1100 / im.width)), Image.LANCZOS)
        im.save(f'{args.dst}/{name}.jpg', quality=80, optimize=True)
    # The time bar strip has imagery behind it, so JPEG suits it better than PNG.
    Image.open(f'{args.src}/timebar.png').convert('RGB').save(f'{args.dst}/timebar.jpg', quality=82, optimize=True)
    for name in panelShots:
        Image.open(f'{args.src}/{name}.png').save(f'{args.dst}/{name}.png', optimize=True)
    frames = [Image.open(f).convert('RGB').resize((420, 420), Image.LANCZOS)
              for f in sorted(glob.glob(f'{args.src}/gif/frame*.png'))]
    paletted = [f.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
    paletted[0].save(f'{args.dst}/jakobshavn-anomaly.gif', save_all=True, append_images=paletted[1:],
                     duration=900, loop=0, optimize=True)
    print(f'{len(fullShots) + len(panelShots) + 2} images -> {args.dst}')


if __name__ == '__main__':
    main()
