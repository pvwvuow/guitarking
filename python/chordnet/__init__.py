"""GuitarKing chordnet — ISMIR-2019 CNN-LSTM large-vocabulary chord model.

Vendored & trimmed from ptnghia-j/chord-cnn-lstm-model (MIT). The five
fold-ensemble checkpoints live in weights/fold*.sdict (~5.7 MB each).
Inference only: no training machinery, no mir/ package dependency.
"""
from .model import ChordNet, CNNFeatureExtractor  # noqa: F401
