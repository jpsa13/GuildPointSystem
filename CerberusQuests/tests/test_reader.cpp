#include "../src/quest_reader.hpp"
#include "../src/flym_profile.hpp"
#include <cassert>
#include <map>
#include <vector>
#include <cstdio>
using namespace QuestProbe;
struct Memory {
    std::map<U32, std::vector<unsigned char>> regions;
    bool operator()(U32 address, void* out, size_t n) {
        auto it = regions.upper_bound(address);
        if (it == regions.begin()) return false;
        --it;
        size_t offset = address - it->first;
        if (offset > it->second.size() || n > it->second.size() - offset) return false;
        std::memcpy(out, it->second.data() + offset, n);
        return true;
    }
    void set(U32 base, size_t offset, U32 value) {
        std::memcpy(regions.at(base).data() + offset, &value, 4);
    }
};
int main() {
    Memory m;
    assert(Observe(m).status == "MANAGER_UNAVAILABLE");
    m.regions[ManagerPointer].resize(4); m.set(ManagerPointer, 0, 0x1000);
    m.regions[0x1000].resize(0x10); m.set(0x1000, 0, 0x00A47494); m.set(0x1000, 0xc, 0x2000);
    m.regions[0x2000].resize(0x34);
    assert(Observe(m).status == "Q082000_NOT_OBSERVED");
    m.set(0x2000, 4, 0x3000); m.set(0x2000, 8, 1); m.set(0x2000, 12, 1);
    m.regions[0x3000].resize(8); m.set(0x3000, 0, 0x4000);
    m.regions[0x4000].resize(0x24c); m.set(0x4000, 0x248, 0x5000);
    m.regions[0x5000].resize(0x30); m.set(0x5000, 0, 0x00A45B1C);
    m.set(0x5000, 0x10, 0x6000); m.set(0x5000, 0x18, 7); m.set(0x5000, 0x28, 123);
    m.regions[0x6000]={Profile::Record.begin(),Profile::Record.end()};
    auto present = Observe(m);
    assert(present.status == "Q082000_PRESENT" && present.slot == 7 && present.flags == 123);
    m.set(0x5000, 0x18, 0);
    assert(Observe(m).slot == 0);
    m.set(0x5000, 0x18, 103);
    assert(Observe(m).status == "Q082000_PRESENT" && Observe(m).slot == 103);
    // A client-side slot remap preserves identity; polling alone does not prove a reward.
    m.set(0x5000, 0x18, 7);
    m.set(0x6000, 4, TargetCode + 1);
    assert(Observe(m).status == "Q082000_NOT_OBSERVED"); // slot reuse is not target identity
    m.set(0x6000, 4, TargetCode); m.set(0x6000, 0, 151);
    assert(Observe(m).status == "TARGET_LAYOUT_MISMATCH");
    m.set(0x6000, 0, 150); m.regions[0x6000].resize(423);
    assert(Observe(m).status == "RECORD_UNREADABLE");
    m.regions[0x6000]={Profile::Record.begin(),Profile::Record.end()}; m.set(0x2000, 8, 2); m.set(0x3000, 4, 0x4000);
    assert(Observe(m).status == "AMBIGUOUS_TARGET");
    m.set(0x1000, 0, 1);
    assert(Observe(m).status == "LAYOUT_UNCONFIRMED");
    m.set(0x1000, 0, 0x00A47494); m.set(0x2000, 8, 1);
    unsigned samples = 0;
    auto changing = [&](U32 address, void* out, size_t size) {
        if (address == 0x5000 && ++samples == 2) m.set(0x5000, 0x28, 456);
        return m(address, out, size);
    };
    assert(Observe(changing).status == "CHANGING_SAMPLE");
    m.set(0x6000,0x88,Word(Profile::Record.data(),0x88)^1);
    assert(Observe(m).status=="TARGET_LAYOUT_MISMATCH");
    m.regions[0x6000]={Profile::Record.begin(),Profile::Record.end()};
    unsigned records=0;
    auto changingRecord=[&](U32 address,void* out,size_t size) {
        if(address==0x6000 && ++records==2) m.set(0x6000,0,151);
        return m(address,out,size);
    };
    assert(Observe(changingRecord).status=="CHANGING_SAMPLE");
    m.regions[0x6000]={Flym::Record.begin(),Flym::Record.end()};
    assert(Observe(m).status=="Q082000_NOT_OBSERVED");
    assert(Observe(m,Flym::Code,Flym::Record).status=="Q082010_PRESENT");
    m.set(0x5000,0x18,103);
    assert(Observe(m,Flym::Code,Flym::Record).slot==103);
    m.set(0x6000,0,999);
    assert(Observe(m,Flym::Code,Flym::Record).status=="TARGET_LAYOUT_MISMATCH");
    m.regions[0x6000]={Flym::Record.begin(),Flym::Record.end()};
    std::vector<JournalEntry> journal;
    assert(Observe(m,TargetCode,Profile::Record,&journal).status=="JOURNAL_OBSERVED");
    assert(journal.size()==1 && Word(journal[0].definition.data(),4)==Flym::Code && journal[0].group==0);
    m.set(0x2000,8,2); m.set(0x3000,4,0x4000);
    assert(Observe(m,TargetCode,Profile::Record,&journal).status=="AMBIGUOUS_LIST" && journal.empty());
    m.set(0x2000,8,1);
    unsigned objectPointers=0;
    auto changingPointer=[&](U32 address,void* out,size_t size) {
        if(address==0x4248 && ++objectPointers==2) m.set(0x4000,0x248,0x5100);
        return m(address,out,size);
    };
    assert(Observe(changingPointer,TargetCode,Profile::Record,&journal).status=="CHANGING_SAMPLE" && journal.empty());
    m.set(0x4000,0x248,0x5000); m.set(0x2000,8,0);
    m.set(0x2000,20,0x3000); m.set(0x2000,24,1); m.set(0x2000,28,1);
    assert(Observe(m,TargetCode,Profile::Record,&journal).status=="JOURNAL_OBSERVED" && journal[0].group==1);
    puts("PASS: absent, present, slot reuse, incompatible layout, truncation, ambiguity; no completion inference");
}
