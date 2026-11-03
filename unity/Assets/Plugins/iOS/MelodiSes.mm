// Şarkıyı Tahmin Et: iTunes önizlemesini (m4a/AAC) iPhone'un kendi oynatıcısıyla çalar.
// Unity'nin ses çözücüsü bu biçimi güvenilir açamadığı için. C# tarafı: Scripts/Oyunlar/Melodi/MelodiSes.cs
#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>

static AVAudioPlayer *oyuncu = nil;
static int durum = 0;            // 0 boş/yükleniyor, 1 hazır, -1 hata
static NSInteger nesil = 0;      // eski indirmeler/durdurmalar yenisini bozmasın

extern "C" {
    void MelodiYukle(const char *adres) {
        NSString *s = [NSString stringWithUTF8String:adres];
        NSInteger benim = ++nesil;
        durum = 0;
        if (oyuncu) { [oyuncu stop]; oyuncu = nil; }
        // sessiz anahtarı açıkken de duyulsun (müzik oyunu)
        [[AVAudioSession sharedInstance] setCategory:AVAudioSessionCategoryPlayback withOptions:AVAudioSessionCategoryOptionMixWithOthers error:nil];
        [[AVAudioSession sharedInstance] setActive:YES error:nil];
        NSURL *url = [NSURL URLWithString:s];
        [[[NSURLSession sharedSession] dataTaskWithURL:url completionHandler:^(NSData *veri, NSURLResponse *yanit, NSError *hata) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (benim != nesil) return;
                if (hata || !veri) { durum = -1; return; }
                NSError *e = nil;
                AVAudioPlayer *o = [[AVAudioPlayer alloc] initWithData:veri error:&e];
                if (!o || e) { durum = -1; return; }
                [o prepareToPlay];
                oyuncu = o; durum = 1;
            });
        }] resume];
    }
    int MelodiHazir() { return durum; }
    void MelodiCal(float saniye) {
        if (!oyuncu) return;
        NSInteger benim = ++nesil;
        oyuncu.currentTime = 0;
        [oyuncu play];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(saniye * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            if (benim == nesil && oyuncu) [oyuncu pause];
        });
    }
    void MelodiDur() { ++nesil; if (oyuncu) [oyuncu pause]; }
    int MelodiCaliyor() { return oyuncu && oyuncu.playing ? 1 : 0; }
}
