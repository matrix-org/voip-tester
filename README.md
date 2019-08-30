TODO

## mxvoiptestd (server tester)

venv


`pip install cffi` (issues if you don't do this manually)

`sudo apt install libavdevice-dev libavfilter-dev libopus-dev libvpx-dev pkg-config`

`python setup.py develop`

https://github.com/aiortc/aiortc

## Default Frontend

A default front-end is presented at the root of the

### SCSS

```
scss scss/tester.scss -t compressed > mxvoiptestd/static/tester.css
```

As we don't expect to change the SCSS much, and we don't want to bother backend
developers with having to touch frontend assets, the resultant `tester.css`
should be committed in this repository whenever `tester.scss` is updated.
