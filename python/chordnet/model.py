"""ChordNet architecture (inference-only port of chordnet_ismir_naive.py)."""
import torch
import torch.nn as nn
import torch.nn.functional as F

SPEC_DIM = 252
SHIFT_HIGH, SHIFT_STEP = 6, 3
TRIAD_LIMIT, SEVENTH_LIMIT, NINTH_LIMIT, ELEVENTH_LIMIT, THIRTEENTH_LIMIT = \
    6, 3, 3, 2, 2
BASS_SLICE_BEGIN = TRIAD_LIMIT * 12 + 1     # triad head: 0=N + 6*12 ids
OUTPUT_DIM1 = TRIAD_LIMIT * 12 + 2 + 12
OUTPUT_DIM2 = (SEVENTH_LIMIT + NINTH_LIMIT + ELEVENTH_LIMIT
               + THIRTEENTH_LIMIT + 4)


class CNNFeatureExtractor(nn.Module):
    def __init__(self):
        super().__init__()
        cd1, cd2, cd3, cd4 = 16, 32, 64, 80
        self.conv1a = nn.Conv2d(1, cd1, (3, 3), padding=(1, 1))
        self.norm1a = nn.InstanceNorm2d(cd1)
        self.conv1b = nn.Conv2d(cd1, cd1, (3, 3), padding=(1, 1))
        self.norm1b = nn.InstanceNorm2d(cd1)
        self.conv1c = nn.Conv2d(cd1, cd1, (3, 3), padding=(1, 1))
        self.norm1c = nn.InstanceNorm2d(cd1)
        self.pool1 = nn.MaxPool2d((1, 3))
        self.conv2a = nn.Conv2d(cd1, cd2, (3, 3), padding=(1, 1))
        self.norm2a = nn.InstanceNorm2d(cd2)
        self.conv2b = nn.Conv2d(cd2, cd2, (3, 3), padding=(1, 1))
        self.norm2b = nn.InstanceNorm2d(cd2)
        self.conv2c = nn.Conv2d(cd2, cd2, (3, 3), padding=(1, 1))
        self.norm2c = nn.InstanceNorm2d(cd2)
        self.pool2 = nn.MaxPool2d((1, 3))
        self.conv3a = nn.Conv2d(cd2, cd3, (3, 3), padding=(1, 1))
        self.norm3a = nn.InstanceNorm2d(cd3)
        self.conv3b = nn.Conv2d(cd3, cd3, (3, 3), padding=(1, 1))
        self.norm3b = nn.InstanceNorm2d(cd3)
        self.pool3 = nn.MaxPool2d((1, 4))
        self.conv4a = nn.Conv2d(cd3, cd4, (3, 3), padding=(1, 0))
        self.norm4a = nn.InstanceNorm2d(cd4)
        self.conv4b = nn.Conv2d(cd4, cd4, (3, 3), padding=(1, 0))
        self.norm4b = nn.InstanceNorm2d(cd4)
        self.output_size = 3 * cd4

    def forward(self, x):
        assert len(x.shape) == 3
        batch_size, seq_length = x.shape[0], x.shape[1]
        x = x.view((batch_size, 1, seq_length, SPEC_DIM))
        x = F.selu(self.norm1a(self.conv1a(x)))
        x = F.selu(self.norm1b(self.conv1b(x)))
        x = F.selu(self.norm1c(self.conv1c(x)))
        x = self.pool1(x)
        x = F.selu(self.norm2a(self.conv2a(x)))
        x = F.selu(self.norm2b(self.conv2b(x)))
        x = F.selu(self.norm2c(self.conv2c(x)))
        x = self.pool2(x)
        x = F.selu(self.norm3a(self.conv3a(x)))
        x = F.selu(self.norm3b(self.conv3b(x)))
        x = self.pool3(x)
        x = F.selu(self.norm4a(self.conv4a(x)))
        x = F.selu(self.norm4b(self.conv4b(x)))
        x = x.transpose(1, 2).contiguous().view(
            (batch_size, seq_length, self.output_size))
        return x


class ChordNet(nn.Module):
    """Six-head output: triad / bass / 7th / 9th / 11th / 13th logits."""

    def __init__(self):
        super().__init__()
        self.audio_feature_block = CNNFeatureExtractor()
        self.hidden_dim1 = 192
        self.lstm1 = nn.LSTM(
            input_size=self.audio_feature_block.output_size,
            hidden_size=self.hidden_dim1 // 2, num_layers=1,
            bidirectional=True, batch_first=True)
        self.final_fc1 = nn.Linear(self.hidden_dim1,
                                   OUTPUT_DIM1 + OUTPUT_DIM2)
        # vestigial layer present in the training checkpoints
        self.condition_linear = nn.Linear(
            self.audio_feature_block.output_size + 12 + TRIAD_LIMIT + 12, 128)

    def forward(self, x):
        batch_size, seq_length = x.shape[0], x.shape[1]
        x = self.audio_feature_block(x)
        h0 = torch.zeros(2, batch_size, self.hidden_dim1 // 2)
        c0 = torch.zeros(2, batch_size, self.hidden_dim1 // 2)
        x1 = self.lstm1(x, (h0, c0))[0]
        x1 = self.final_fc1(x1).reshape(
            (batch_size * seq_length, OUTPUT_DIM1 + OUTPUT_DIM2))
        bass_del = BASS_SLICE_BEGIN + 12 + 1
        seventh_del = bass_del + SEVENTH_LIMIT + 1
        ninth_del = seventh_del + NINTH_LIMIT + 1
        eleventh_del = ninth_del + ELEVENTH_LIMIT + 1
        thirteenth_del = eleventh_del + THIRTEENTH_LIMIT + 1
        return (x1[:, :BASS_SLICE_BEGIN],
                x1[:, BASS_SLICE_BEGIN:bass_del],
                x1[:, bass_del:seventh_del],
                x1[:, seventh_del:ninth_del],
                x1[:, ninth_del:eleventh_del],
                x1[:, eleventh_del:thirteenth_del])

    def probs(self, cqt_sliced):
        """cqt_sliced: numpy (frames, SPEC_DIM) -> list of 6 softmax arrays."""
        x = torch.tensor(cqt_sliced, dtype=torch.float32).unsqueeze(0)
        with torch.no_grad():
            outs = self.forward(x)
        return [F.softmax(t, dim=1).numpy() for t in outs]


def load_net(path):
    net = ChordNet()
    sd = torch.load(path, map_location="cpu", weights_only=False)
    net.load_state_dict(sd["net"])
    net.eval()
    return net
